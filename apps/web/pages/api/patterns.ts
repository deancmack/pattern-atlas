import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )
    const { data, error } = await sb
      .from('patterns')
      .select('id, name, subtitle, register, registers, source_thinkers, complexity_class, difficulty, field_tested, koan')
      .order('name')
    if (error) return res.status(500).json({ error: error.message })
    res.json({ patterns: data })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
}
