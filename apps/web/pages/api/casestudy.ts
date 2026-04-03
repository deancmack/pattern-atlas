import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin, Pattern } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { domain } = req.body
  if (!domain?.trim()) return res.status(400).json({ error: 'domain required' })

  const { data: patterns } = await supabaseAdmin.from('patterns').select('*')
  if (!patterns) return res.status(500).json({ error: 'Failed to load patterns' })

  const compactLibrary = patterns.map((p: Pattern) =>
    `ID: ${p.id}\nName: ${p.name}\nCore claim: ${p.core_claim || ''}\nSituation signature: ${p.situation_signature || ''}`
  ).join('\n\n')

  // Step 1: Generate a real historical case in this domain
  const caseResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are building a teaching case study for a practitioner learning strategic pattern recognition.

Generate a real historical situation in the domain they name. Requirements:
- It must be a real event with real actors, real dates, real stakes
- 3–4 paragraphs describing the situation as it unfolded — not the outcome
- Enough detail that patterns can be applied to it
- Stop before revealing what happened — the practitioner will work through it

Return JSON: { "title": "...", "situation": "..." }`,
    messages: [{ role: 'user', content: `Domain: ${domain}` }]
  })

  let title = '', situation = ''
  try {
    let raw = (caseResponse.content[0] as any).text.trim()
    if (raw.startsWith('```')) raw = raw.split('```')[1].replace(/^json/, '')
    const parsed = JSON.parse(raw)
    title = parsed.title
    situation = parsed.situation
  } catch {
    return res.status(500).json({ error: 'Case generation failed' })
  }

  // Step 2: Select matching patterns
  const matchResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: 'Return ONLY a JSON array of pattern IDs that are operating in this situation. 3–5 patterns. No prose.',
    messages: [{
      role: 'user',
      content: `Pattern library:\n\n${compactLibrary}\n\n───\n\nSituation:\n${situation}\n\nReturn JSON array of matching pattern IDs.`
    }]
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

  // Step 3: Generate application questions
  const questionsResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: 'Generate 4–5 sharp application questions that ask the practitioner to apply the identified patterns to the specific details of this case. Questions only — no preamble. Return as JSON array of strings.',
    messages: [{
      role: 'user',
      content: `Situation: ${situation}\n\nPatterns: ${matchedPatterns.map(p => p.name).join(', ')}\n\nGenerate application questions.`
    }]
  })

  let questions: string[] = []
  try {
    let raw = (questionsResponse.content[0] as any).text.trim()
    if (raw.startsWith('```')) raw = raw.split('```')[1].replace(/^json/, '')
    questions = JSON.parse(raw)
  } catch { questions = [] }

  // Step 4: Synthesis
  const synthResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: 'Write 3–4 sentences explaining what this case reveals about the patterns operating in it. What does seeing these patterns simultaneously make visible that seeing any one alone would not?',
    messages: [{
      role: 'user',
      content: `Case: ${situation}\nPatterns: ${matchedPatterns.map(p => p.name).join(', ')}`
    }]
  })
  const synthesis = (synthResponse.content[0] as any).text.trim()

  res.json({ title, situation, patterns: matchedPatterns, questions, synthesis })
}
