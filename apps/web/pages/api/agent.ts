import type { NextApiRequest, NextApiResponse } from 'next'

const MODEL = 'claude-sonnet-4-20250514'

const SELECTION_SYSTEM = `You are the Pattern Atlas agent. A practitioner describes a real situation. Your job is to identify which patterns from the library are structurally operating in that situation.

Return ONLY a JSON object with exactly these keys:
{
  "core": ["id1", "id2", "id3"],
  "secondary": ["id4", "id5"],
  "wildcard": "id6"
}

No explanation, no prose, no markdown — just the raw JSON object.

Rules:
- Core patterns: 3 to 5 strongest matches. These should be the most grounded, best-evidenced, and most structurally central patterns in the situation.
- Secondary patterns: 2 to 4 additional useful matches. These should deepen, support, or extend the analysis, but should be less central than the core patterns.
- Wildcard: exactly 1 pattern. This should be a non-obvious but genuinely illuminating cross-domain match — interesting because it reveals something real, not because it sounds clever.
- Total patterns should usually be between 6 and 10.
- Prioritize fit first, then diversity, then surprise.
- Do not sacrifice strong obvious matches in order to include more creative ones.
- Actively look across disciplinary boundaries, but only include unexpected patterns when their core logic genuinely maps onto the situation.
- Do not include patterns just because they are loosely related to the domain. The pattern's core claim must actually explain something specific about this situation.
- Order each array by relevance, strongest first.
- Do not repeat a pattern across categories.
- The wildcard must not duplicate the logic of the core patterns too closely.`

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

    // Build compact library for selection — id, name, core_claim only.
    // Situation signature and hot signals are for the human practitioner,
    // not for pattern selection. Keeping this minimal reduces token usage
    // and improves cross-domain matching by keeping Claude at the level
    // of structural logic rather than pre-interpreted signals.
    const compactLibrary = patterns.map((p: any) =>
      `ID: ${p.id}\nName: ${p.name}\nCore claim: ${p.core_claim || ''}`
    ).join('\n\n')

    // Step 1: Select matching pattern IDs
    const selectionResponse = await ai.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: SELECTION_SYSTEM,
      messages: [{ role: 'user', content: `Pattern library:\n\n${compactLibrary}\n\n───\n\nSituation:\n${situation}\n\nReturn the JSON array of matching pattern IDs.` }]
    })

    let matchedIds: string[] = []
    let selectionTiers: { core: string[]; secondary: string[]; wildcard: string | null } = {
      core: [],
      secondary: [],
      wildcard: null,
    }
    try {
      let raw = (selectionResponse.content[0] as any).text.trim()
      if (raw.startsWith('```')) raw = raw.split('```')[1].replace(/^json/, '')
      const parsed = JSON.parse(raw)

      selectionTiers = {
        core: Array.isArray(parsed.core) ? parsed.core : [],
        secondary: Array.isArray(parsed.secondary) ? parsed.secondary : [],
        wildcard: typeof parsed.wildcard === 'string' ? parsed.wildcard : null,
      }

      const seen = new Set<string>()
      matchedIds = [
        ...selectionTiers.core,
        ...selectionTiers.secondary,
        ...(selectionTiers.wildcard ? [selectionTiers.wildcard] : []),
      ].filter((id: string) => {
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
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
      tiers: selectionTiers,
      matched: matchedPatterns.map((p: any) => ({
        pattern: p,
        reason: matchReasons[p.id] || '',
        tier: selectionTiers.core.includes(p.id)
          ? 'core'
          : selectionTiers.secondary.includes(p.id)
            ? 'secondary'
            : selectionTiers.wildcard === p.id
              ? 'wildcard'
              : null,
      })),
      synthesis
    })

  } catch (err: any) {
    console.error('Agent error:', err)
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
}
