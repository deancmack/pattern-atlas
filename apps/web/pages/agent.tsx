import { useState } from 'react'
import PatternEntry from '@/components/PatternEntry'
import { Pattern } from '@/lib/supabase'

type MatchResult = { pattern: Pattern; reason: string }

export default function AgentPage() {
  const [situation, setSituation] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ matched: MatchResult[]; synthesis: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!situation.trim()) return
    setLoading(true)
    setResults(null)
    setError(null)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(`API error ${res.status}: ${JSON.stringify(data)}`)
      } else {
        setResults(data)
      }
    } catch (err: any) {
      setError(`Network error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Situation Agent</h1>
      <p className="lead" style={{ marginBottom: 32 }}>
        Describe a real situation. The agent identifies which patterns are operating and why.
      </p>

      <form onSubmit={handleSubmit}>
        <textarea
          value={situation}
          onChange={e => setSituation(e.target.value)}
          placeholder="Describe your situation in as much detail as you want — the actors, the dynamics, what feels off, what is at stake..."
          style={{ marginBottom: 12 }}
        />
        <button type="submit" disabled={loading || !situation.trim()}>
          {loading ? 'Analysing…' : 'Identify Patterns'}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: 24, background: '#2a0a0a', border: '1px solid #c0392b', borderRadius: 6, padding: 16, color: '#e74c3c', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading" style={{ marginTop: 40 }}>
          <div className="spinner" />
          Searching pattern library…
        </div>
      )}

      {results && !loading && (
        <div style={{ marginTop: 48 }}>
          <div className="section-label">{results.matched.length} patterns identified</div>

          {results.matched.map(({ pattern, reason }, i) => (
            <div key={pattern.id}>
              <div style={{ marginBottom: 12 }}>
                <div className="match-label">Pattern {i + 1} of {results.matched.length} — why it matches</div>
                <div className="match-reason">{reason}</div>
              </div>
              <PatternEntry pattern={pattern} />
            </div>
          ))}

          {results.synthesis && (
            <div className="synthesis">
              <h3>How These Patterns Interact</h3>
              <p>{results.synthesis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
