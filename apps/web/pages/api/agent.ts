import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin, Pattern } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

const SELECTION_SYSTEM = `You are the Pattern Atlas agent. A practitioner describes a real situation. \
Your job is to identify which patterns from the library are genuinely operating in that situation.

Return ONLY a JSON array of pattern IDs (the slug strings), ordered by relevance. \
No explanation, no prose, no markdown — just the raw JSON array.

Example output: ["structural-holes", "phase-transition", "hysteresis"]

Be selective. Only include patterns that genuinely fit. 2–5 patterns is typical.`

const INTERACTION_SYSTEM = `You are the Pattern Atlas agent. You have identified which patterns are operating \
in a practitioner's situation. Write a short synthesis (3–6 sentences max) of how these specific \
patterns interact with each other in this specific situation. Be concrete — reference actual details \
from the situation. Do not summarize the patterns themselves. Focus only on how they relate to each other.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
  const { situation } = req.body
  if (!situation?.trim()) return res.status(400).json({ error: 'situation required' })

  // Fetch all patterns
  const { data: patterns, error } = await supabaseAdmin
    .from('patterns')
    .select('*')
  if (error || !patterns) return res.status(500).json({ error: 'Failed to load patterns', detail: error?.message })

  // Build compact library for selection
  const compactLibrary = patterns.map((p: Pattern) =>
    `ID: ${p.id}\nName: ${p.name}\nCore claim: ${p.core_claim || ''}\nSituation signature: ${p.situation_signature || ''}\nHot signals: ${p.hot_signals || ''}`
  ).join('\n\n')

  // Step 1: Select matching pattern IDs
  const selectionResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: SELECTION_SYSTEM,
    messages: [{
      role: 'user',
      content: `Pattern library:\n\n${compactLibrary}\n\n───\n\nSituation:\n${situation}\n\nReturn the JSON array of matching pattern IDs.`
    }]
  })

  let matchedIds: string[] = []
  try {
    let raw = (selectionResponse.content[0] as any).text.trim()
    if (raw.startsWith('```')) raw = raw.split('```')[1].replace(/^json/, '')
    matchedIds = JSON.parse(raw)
  } catch {
    return res.status(500).json({ error: 'Pattern selection failed' })
  }

  const matchedPatterns = matchedIds
    .map(id => patterns.find((p: Pattern) => p.id === id))
    .filter(Boolean) as Pattern[]

  if (!matchedPatterns.length) {
    return res.json({ matched: [], synthesis: null })
  }

  // Step 2: Get a one-sentence match reason for each pattern
  const matchReasons: Record<string, string> = {}
  await Promise.all(matchedPatterns.map(async (p) => {
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 128,
      system: 'One sentence only. Be specific. Reference concrete details from the situation.',
      messages: [{
        role: 'user',
        content: `Pattern: ${p.name}\nSituation signature: ${p.situation_signature || ''}\nHot signals: ${p.hot_signals || ''}\n\nSituation: ${situation}\n\nIn one sentence, say specifically why this pattern matches.`
      }]
    })
    matchReasons[p.id] = (r.content[0] as any).text.trim()
  }))

  // Step 3: Interaction synthesis
  let synthesis = null
  if (matchedPatterns.length > 1) {
    const synthResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: INTERACTION_SYSTEM,
      messages: [{
        role: 'user',
        content: `Situation: ${situation}\n\nMatched patterns: ${matchedPatterns.map(p => p.name).join(', ')}\n\nHow do these patterns interact in this situation?`
      }]
    })
    synthesis = (synthResponse.content[0] as any).text.trim()
  }

  res.json({
    matched: matchedPatterns.map(p => ({
      pattern: p,
      reason: matchReasons[p.id] || ''
    })),
    synthesis
  })
  } catch (err: any) {
    console.error('Agent API error:', err)
    res.status(500).json({ error: err?.message || 'Unknown error', stack: err?.stack })
  }
}
