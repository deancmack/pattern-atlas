import { useState } from 'react'
import PatternEntry from '@/components/PatternEntry'
import { Pattern } from '@/lib/supabase'

type CaseStudyResult = {
  title: string
  situation: string
  patterns: Pattern[]
  questions: string[]
  synthesis: string
}

export default function CaseStudyPage() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CaseStudyResult | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/casestudy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Case Study Mode</h1>
      <p className="lead" style={{ marginBottom: 32 }}>
        Name a domain or topic. A real historical situation becomes your terrain.
        Apply patterns from the library to understand what happened.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="e.g. municipal bond financing, coalition collapse, urban renewal, hostile takeover..."
          style={{ marginBottom: 12 }}
        />
        <button type="submit" disabled={loading || !domain.trim()}>
          {loading ? 'Building case…' : 'Generate Case Study'}
        </button>
      </form>

      {loading && (
        <div className="loading" style={{ marginTop: 40 }}>
          <div className="spinner" />
          Building case study…
        </div>
      )}

      {result && !loading && (
        <div style={{ marginTop: 48 }}>
          <div className="card card-accent" style={{ marginBottom: 32 }}>
            <h2 style={{ marginBottom: 8 }}>{result.title}</h2>
            <p style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{result.situation}</p>
          </div>

          <hr />
          <div className="section-label">Patterns Operating in This Situation</div>

          {result.patterns.map(p => <PatternEntry key={p.id} pattern={p} />)}

          {result.questions?.length > 0 && (
            <>
              <hr />
              <div className="section-label">Work Through These</div>
              <div className="card">
                {result.questions.map((q, i) => (
                  <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < result.questions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600, marginRight: 8 }}>{i + 1}.</span>
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {result.synthesis && (
            <div className="synthesis">
              <h3>What This Case Reveals</h3>
              <p>{result.synthesis}</p>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <button onClick={() => setResult(null)}>New Case Study</button>
          </div>
        </div>
      )}
    </div>
  )
}
