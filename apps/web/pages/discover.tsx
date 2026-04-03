import { useState } from 'react'
import PatternEntry from '@/components/PatternEntry'
import { Pattern } from '@/lib/supabase'

export default function DiscoverPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ pattern: Pattern; lesson: string } | null>(null)

  async function discover(patternId?: string) {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patternId })
      })
      setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  function renderLesson(text: string) {
    // Convert markdown-style ## headers and paragraphs
    const lines = text.split('\n')
    return lines.map((line, i) => {
      if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
      if (line.trim() === '') return <br key={i} />
      return <p key={i}>{line}</p>
    })
  }

  return (
    <div className="container">
      <h1>Discovery Mode</h1>
      <p className="lead" style={{ marginBottom: 32 }}>
        Pull a pattern at random. Read it slowly. Let it work on you.
      </p>

      <button onClick={() => discover()} disabled={loading}>
        {loading ? 'Loading…' : result ? 'Next Pattern' : 'Pull a Pattern'}
      </button>

      {loading && (
        <div className="loading" style={{ marginTop: 40 }}>
          <div className="spinner" />
          Generating discovery lesson…
        </div>
      )}

      {result && !loading && (
        <div style={{ marginTop: 48 }}>
          <div className="section-label">The Pattern</div>
          <PatternEntry pattern={result.pattern} />

          <hr />

          <div className="section-label">Discovery Lesson</div>
          <div className="card lesson">
            {renderLesson(result.lesson)}
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button onClick={() => discover()} disabled={loading}>Next Pattern</button>
            <button className="secondary" onClick={() => setResult(null)}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}
