import type { NextApiRequest, NextApiResponse } from 'next'

const MODEL = 'claude-sonnet-4-20250514'

const SELECTION_SYSTEM = `You are the Pattern Atlas agent. A practitioner describes a real situation. Your job is to identify which patterns from the library are genuinely operating in that situation.

Return ONLY a JSON array of pattern IDs (the slug strings), ordered by relevance. No explanation, no prose, no markdown — just the raw JSON array.

Example output: ["structural-holes", "phase-transition", "hysteresis"]

Be selective. Only include patterns that genuinely fit. 2–5 patterns is typical.`

const INTERACTION_SYSTEM = `You are the Pattern Atlas agent. You have identified which patterns are operating in a practitioner's situation. Write a short synthesis (3–6 sentences max) of how these specific patterns interact with each other in this specific situation. Be concrete — reference actual details from the situation. Do not summarize the patterns themselves. Focus only on how they relate to each other.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    // Check env vars first
    const sbUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey  = process.env.SUPABASE_SERVICE_KEY
    const aiKey  = process.env.ANTHROPIC_API_KEY

    if (!sbUrl)  return res.status(500).json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' })
    if (!sbKey)  return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_KEY' })
    if (!aiKey)  return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' })

    // Lazy-load clients
    const { createClient } = await import('@supabase/supabase-js')
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const sb = createClient(sbUrl, sbKey)
    const ai = new Anthropic({ apiKey: aiKey })

    const { situation } = req.body
    if (!situation?.trim()) return res.status(400).json({ error: 'situation required' })

    // Fetch all patterns
    const { data: patterns, error: dbError } = await sb.from('patterns').select('*')
    if (dbError) return res.status(500).json({ error: 'Supabase error', detail: dbError.message })
    if (!patterns?.length) return res.status(500).json({ error: 'No patterns found in database' })

    // Build compact library for selection
    const compactLibrary = patterns.map((p: any) =>
      `ID: ${p.id}\nName: ${p.name}\nCore claim: ${p.core_claim || ''}\nSituation signature: ${p.situation_signature || ''}\nHot signals: ${p.hot_signals || ''}`
    ).join('\n\n')

    // Step 1: Select matching pattern IDs
    const selectionResponse = await ai.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: SELECTION_SYSTEM,
      messages: [{ role: 'user', content: `Pattern library:\n\n${compactLibrary}\n\n───\n\nSituation:\n${situation}\n\nReturn the JSON array of matching pattern IDs.` }]
    })

    let matchedIds: string[] = []
    try {
      let raw = (selectionResponse.content[0] as any).text.trim()
      if (raw.startsWith('```')) raw = raw.split('```')[1].replace(/^json/, '')
      matchedIds = JSON.parse(raw)
    } catch {
      return res.status(500).json({ error: 'Pattern selection parse failed' })
    }

    const matchedPatterns = matchedIds
      .map((id: string) => patterns.find((p: any) => p.id === id))
      .filter(Boolean)

    if (!matchedPatterns.length) {
      return res.json({ matched: [], synthesis: null })
    }

    // Step 2: Match reasons
    const matchReasons: Record<string, string> = {}
    await Promise.all(matchedPatterns.map(async (p: any) => {
      const r = await ai.messages.create({
        model: MODEL,
        max_tokens: 128,
        system: 'One sentence only. Be specific. Reference concrete details from the situation.',
        messages: [{ role: 'user', content: `Pattern: ${p.name}\nSituation signature: ${p.situation_signature || ''}\nHot signals: ${p.hot_signals || ''}\n\nSituation: ${situation}\n\nIn one sentence, say specifically why this pattern matches.` }]
      })
      matchReasons[p.id] = (r.content[0] as any).text.trim()
    }))

    // Step 3: Synthesis
    let synthesis = null
    if (matchedPatterns.length > 1) {
      const synthResponse = await ai.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: INTERACTION_SYSTEM,
        messages: [{ role: 'user', content: `Situation: ${situation}\n\nMatched patterns: ${matchedPatterns.map((p: any) => p.name).join(', ')}\n\nHow do these patterns interact in this situation?` }]
      })
      synthesis = (synthResponse.content[0] as any).text.trim()
    }

    res.json({
      matched: matchedPatterns.map((p: any) => ({ pattern: p, reason: matchReasons[p.id] || '' })),
      synthesis
    })

  } catch (err: any) {
    console.error('Agent error:', err)
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
}
