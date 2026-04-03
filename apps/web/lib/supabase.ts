import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Client-side (anon key — respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side only (service role — bypasses RLS, for API routes)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export type Pattern = {
  id: string
  name: string
  subtitle: string | null
  register: string
  registers: string[]
  source_disciplines: string[]
  source_thinkers: string[]
  complexity_class: string | null
  core_claim: string | null
  structure: string | null
  conditions: string | null
  failure_modes: string | null
  situation_signature: string | null
  hot_signals: string | null
  leverage_points: string | null
  koan: string | null
  canonical_example: string | null
  counter_example: string | null
  application_questions: string | null
  common_mistakes: string | null
  practitioner_notes: string | null
  example_domains: string[]
  related_patterns: string[]
  difficulty: number | null
  field_tested: boolean
  date_added: string | null
}

export type Register = {
  id: string
  name: string
  description: string | null
  display_order: number
}
