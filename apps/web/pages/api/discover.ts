import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin, Pattern } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

const DISCOVERY_SYSTEM = `You are a teacher of strategic pattern recognition. You have been given a pattern \
from a practitioner's library. Generate a rich discovery lesson for this pattern.

Structure your response with these exact sections:

## The Thinker
Who developed this concept, when, and in what context. What problem were they trying to solve. \
What made their approach distinctive.

## Historical Emergence  
The specific intellectual and historical moment this pattern emerged from. What it was a response to. \
How it spread across disciplines.

## The Pattern in Action
Two or three vivid, concrete examples of this pattern operating in the real world — across different \
domains. Be specific: name real events, people, organizations, dates where possible.

## Why It Matters for Practitioners
What changes in how you see situations once you have this pattern. What you can do with it that \
you could not do without it. What it makes visible that was previously invisible.

## The Edge Cases
Where this pattern misleads. When it looks like this pattern but isn't. The failure modes that \
trap even sophisticated practitioners.

Tone: intellectually serious, concrete, practitioner-facing. Not academic. Not a Wikipedia summary. \
Write as if explaining to a highly intelligent professional who has never encountered this concept.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { patternId } = req.body

  let pattern: Pattern | null = null

  if (patternId) {
    const { data } = await supabaseAdmin
      .from('patterns')
      .select('*')
      .eq('id', patternId)
      .single()
    pattern = data
  } else {
    // Random pattern
    const { data: all } = await supabaseAdmin.from('patterns').select('id')
    if (!all?.length) return res.status(500).json({ error: 'No patterns found' })
    const randomId = all[Math.floor(Math.random() * all.length)].id
    const { data } = await supabaseAdmin
      .from('patterns')
      .select('*')
      .eq('id', randomId)
      .single()
    pattern = data
  }

  if (!pattern) return res.status(404).json({ error: 'Pattern not found' })

  const patternContext = `
Name: ${pattern.name}
Subtitle: ${pattern.subtitle || ''}
Source disciplines: ${pattern.source_disciplines?.join(', ') || ''}
Source thinkers: ${pattern.source_thinkers?.join(', ') || ''}
Core claim: ${pattern.core_claim || ''}
Structure: ${pattern.structure || ''}
Koan: ${pattern.koan || ''}
Canonical example: ${pattern.canonical_example || ''}
Example domains: ${pattern.example_domains?.join(', ') || ''}
`.trim()

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: DISCOVERY_SYSTEM,
    messages: [{
      role: 'user',
      content: `Generate a discovery lesson for this pattern:\n\n${patternContext}`
    }]
  })

  const lesson = (response.content[0] as any).text.trim()

  res.json({ pattern, lesson })
}
