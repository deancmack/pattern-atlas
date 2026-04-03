import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin, Pattern } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

const FRAMING_SYSTEM = `You are a reflective practice facilitator for a strategic practitioner. \
They have described a real situation they were in. Your job is to open the reflection session.

Write 2–3 sentences that:
1. Name what kind of situation this is at a structural level (not just content level)
2. Identify the central tension or dynamic at stake
3. Frame what the reflection will be trying to surface

Do not summarize what they said back to them. Elevate it to the structural level immediately.`

const PATTERN_MATCH_SYSTEM = `You are the Pattern Atlas agent. A practitioner is reflecting on a real situation \
they were in. Identify which patterns from the library were operating — whether they saw them at the time or not.

Return ONLY a JSON array of pattern IDs ordered by relevance. 2–6 patterns. No prose, no markdown.`

const QUESTION_SYSTEM = `You are a reflective practice facilitator. A practitioner is reflecting on a real situation. \
You have identified which patterns were operating. Generate one incisive reflective question about this pattern \
in this specific situation. The question should help them see something they may have missed. \
One question only. No preamble.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { action, situation, sessionId, patternId, answer } = req.body

  // ── START: Create new session, frame it, match patterns ──────────────────
  if (action === 'start') {
    if (!situation?.trim()) return res.status(400).json({ error: 'situation required' })

    // Generate AI framing
    const framingResponse = await anthropic.messages.create({
      model: MODEL, max_tokens: 256, system: FRAMING_SYSTEM,
      messages: [{ role: 'user', content: situation }]
    })
    const aiFraming = (framingResponse.content[0] as any).text.trim()

    // Fetch all patterns and match
    const { data: patterns } = await supabaseAdmin.from('patterns').select('*')
    if (!patterns) return res.status(500).json({ error: 'Failed to load patterns' })

    const compactLibrary = patterns.map((p: Pattern) =>
      `ID: ${p.id}\nName: ${p.name}\nSituation signature: ${p.situation_signature || ''}\nHot signals: ${p.hot_signals || ''}`
    ).join('\n\n')

    const matchResponse = await anthropic.messages.create({
      model: MODEL, max_tokens: 256, system: PATTERN_MATCH_SYSTEM,
      messages: [{ role: 'user', content: `Library:\n\n${compactLibrary}\n\n───\n\nSituation:\n${situation}\n\nReturn JSON array of matching IDs.` }]
    })

    let matchedIds: string[] = []
    try {
      let raw = (matchResponse.content[0] as any).text.trim()
      if (raw.startsWith('```')) raw = raw.split('```')[1].replace(/^json/, '')
      matchedIds = JSON.parse(raw)
    } catch { matchedIds = [] }

    const matchedPatterns = matchedIds
      .map(id => patterns.find((p: Pattern) => p.id === id))
      .filter(Boolean) as Pattern[]

    // Save session to Supabase
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('journal_sessions')
      .insert({ raw_description: situation, ai_framing: aiFraming })
      .select()
      .single()

    if (sessionError || !session) return res.status(500).json({ error: 'Failed to create session' })

    // Save matched patterns
    if (matchedPatterns.length > 0) {
      await supabaseAdmin.from('journal_session_patterns').insert(
        matchedPatterns.map((p, i) => ({
          session_id: session.id,
          pattern_id: p.id,
          display_order: i
        }))
      )
    }

    return res.json({
      sessionId: session.id,
      aiFraming,
      matchedPatterns
    })
  }

  // ── REFLECT: Get reflective question for a pattern ────────────────────────
  if (action === 'reflect') {
    if (!sessionId || !patternId) return res.status(400).json({ error: 'sessionId and patternId required' })

    const { data: session } = await supabaseAdmin
      .from('journal_sessions').select('raw_description').eq('id', sessionId).single()

    const { data: pattern } = await supabaseAdmin
      .from('patterns').select('name, situation_signature, hot_signals, leverage_points, koan').eq('id', patternId).single()

    if (!session || !pattern) return res.status(404).json({ error: 'Not found' })

    const questionResponse = await anthropic.messages.create({
      model: MODEL, max_tokens: 128, system: QUESTION_SYSTEM,
      messages: [{
        role: 'user',
        content: `Situation: ${session.raw_description}\n\nPattern: ${(pattern as any).name}\nKoan: ${(pattern as any).koan || ''}\nLeverage points: ${(pattern as any).leverage_points || ''}\n\nGenerate one reflective question.`
      }]
    })

    const question = (questionResponse.content[0] as any).text.trim()

    // Save question to journal_reflections
    const { data: reflection } = await supabaseAdmin
      .from('journal_reflections')
      .insert({ session_id: sessionId, pattern_id: patternId, question })
      .select()
      .single()

    return res.json({ reflectionId: (reflection as any)?.id, question })
  }

  // ── ANSWER: Save user's answer + generate AI response ────────────────────
  if (action === 'answer') {
    const { reflectionId } = req.body
    if (!reflectionId || !answer) return res.status(400).json({ error: 'reflectionId and answer required' })

    const { data: reflection } = await supabaseAdmin
      .from('journal_reflections').select('*').eq('id', reflectionId).single()

    if (!reflection) return res.status(404).json({ error: 'Reflection not found' })

    const aiResponseResult = await anthropic.messages.create({
      model: MODEL, max_tokens: 256,
      system: 'You are a reflective practice facilitator. Respond to the practitioner\'s answer with a brief observation (2-3 sentences). Surface what their answer reveals. Do not ask another question.',
      messages: [{
        role: 'user',
        content: `Question: ${(reflection as any).question}\nAnswer: ${answer}`
      }]
    })

    const aiResponse = (aiResponseResult.content[0] as any).text.trim()

    await supabaseAdmin
      .from('journal_reflections')
      .update({ answer, ai_response: aiResponse })
      .eq('id', reflectionId)

    return res.json({ aiResponse })
  }

  // ── CLOSE: Finalize session with summary ──────────────────────────────────
  if (action === 'close') {
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

    const { data: session } = await supabaseAdmin
      .from('journal_sessions').select('*').eq('id', sessionId).single()

    const { data: sessionPatterns } = await supabaseAdmin
      .from('journal_session_patterns')
      .select('pattern_id, visibility')
      .eq('session_id', sessionId)

    const { data: reflections } = await supabaseAdmin
      .from('journal_reflections')
      .select('question, answer, ai_response')
      .eq('session_id', sessionId)

    const summaryResponse = await anthropic.messages.create({
      model: MODEL, max_tokens: 512,
      system: 'Generate a closing summary for a reflection session. 3–4 sentences. What was the key structural insight? What pattern was most live? What is the practitioner now positioned to see that they may not have seen before?',
      messages: [{
        role: 'user',
        content: `Situation: ${(session as any)?.raw_description}\n\nReflections:\n${(reflections || []).map((r: any) => `Q: ${r.question}\nA: ${r.answer || '(skipped)'}`).join('\n\n')}`
      }]
    })

    const summary = (summaryResponse.content[0] as any).text.trim()

    await supabaseAdmin
      .from('journal_sessions')
      .update({ ai_summary: summary, is_complete: true, closed_at: new Date().toISOString() })
      .eq('id', sessionId)

    return res.json({ summary })
  }

  res.status(400).json({ error: 'Unknown action' })
}
