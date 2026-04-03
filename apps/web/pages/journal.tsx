import { useState } from 'react'
import { Pattern } from '@/lib/supabase'

type Phase = 'input' | 'reflecting' | 'complete'

type MatchedPattern = Pattern & { reflectionId?: string; question?: string; answer?: string; aiResponse?: string }

export default function JournalPage() {
  const [phase, setPhase] = useState<Phase>('input')
  const [situation, setSituation] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [aiFraming, setAiFraming] = useState('')
  const [matchedPatterns, setMatchedPatterns] = useState<MatchedPattern[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [summary, setSummary] = useState('')

  async function startSession() {
    if (!situation.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/journal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', situation })
      })
      const data = await res.json()
      setSessionId(data.sessionId)
      setAiFraming(data.aiFraming)

      // Get first reflection question for each pattern
      const patternsWithQ: MatchedPattern[] = []
      for (const p of data.matchedPatterns) {
        const qRes = await fetch('/api/journal/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reflect', sessionId: data.sessionId, patternId: p.id })
        })
        const qData = await qRes.json()
        patternsWithQ.push({ ...p, reflectionId: qData.reflectionId, question: qData.question })
      }

      setMatchedPatterns(patternsWithQ)
      setCurrentIdx(0)
      setPhase('reflecting')
    } finally {
      setLoading(false)
    }
  }

  async function submitAnswer() {
    const current = matchedPatterns[currentIdx]
    if (!current.reflectionId || !currentAnswer.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/journal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', reflectionId: current.reflectionId, answer: currentAnswer })
      })
      const data = await res.json()

      const updated = [...matchedPatterns]
      updated[currentIdx] = { ...current, answer: currentAnswer, aiResponse: data.aiResponse }
      setMatchedPatterns(updated)
      setCurrentAnswer('')

      if (currentIdx < matchedPatterns.length - 1) {
        setCurrentIdx(currentIdx + 1)
      } else {
        await closeSession()
      }
    } finally {
      setLoading(false)
    }
  }

  async function closeSession() {
    if (!sessionId) return
    const res = await fetch('/api/journal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', sessionId })
    })
    const data = await res.json()
    setSummary(data.summary)
    setPhase('complete')
  }

  function reset() {
    setPhase('input')
    setSituation('')
    setSessionId(null)
    setAiFraming('')
    setMatchedPatterns([])
    setCurrentIdx(0)
    setCurrentAnswer('')
    setSummary('')
  }

  const current = matchedPatterns[currentIdx]

  return (
    <div className="container">
      <h1>Reflection Journal</h1>
      <p className="lead" style={{ marginBottom: 32 }}>
        Describe a real situation you were in. Map what happened against the pattern library.
        Everything is saved.
      </p>

      {/* INPUT PHASE */}
      {phase === 'input' && (
        <>
          <textarea
            value={situation}
            onChange={e => setSituation(e.target.value)}
            placeholder="Describe a real meeting, negotiation, or situation you were in. What happened, who was involved, what was at stake, what you did, what the outcome was..."
            style={{ marginBottom: 12, minHeight: 160 }}
          />
          <button onClick={startSession} disabled={loading || !situation.trim()}>
            {loading ? 'Starting session…' : 'Begin Reflection'}
          </button>
        </>
      )}

      {/* REFLECTING PHASE */}
      {phase === 'reflecting' && (
        <>
          {aiFraming && (
            <div className="card card-accent" style={{ marginBottom: 32 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Framing</div>
              <p style={{ color: 'var(--text)', margin: 0 }}>{aiFraming}</p>
            </div>
          )}

          <div className="section-label">
            Pattern {currentIdx + 1} of {matchedPatterns.length}: {current?.name}
          </div>

          {/* Completed reflections */}
          {matchedPatterns.slice(0, currentIdx).map((p, i) => (
            <div key={p.id} className="reflection-block answered" style={{ marginBottom: 20 }}>
              <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
              <div className="question-text" style={{ fontSize: 14, color: 'var(--muted)' }}>{p.question}</div>
              <div style={{ margin: '8px 0', fontSize: 14, color: 'var(--text)', fontStyle: 'italic' }}>"{p.answer}"</div>
              {p.aiResponse && <div className="ai-response">{p.aiResponse}</div>}
            </div>
          ))}

          {/* Current question */}
          {current && !current.answer && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="question-text">{current.question}</div>
              <textarea
                value={currentAnswer}
                onChange={e => setCurrentAnswer(e.target.value)}
                placeholder="Your response…"
                style={{ marginTop: 16, marginBottom: 12, minHeight: 80 }}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={submitAnswer} disabled={loading || !currentAnswer.trim()}>
                  {loading ? 'Saving…' : currentIdx < matchedPatterns.length - 1 ? 'Next Pattern' : 'Complete Session'}
                </button>
                <button className="ghost" onClick={closeSession} disabled={loading}>Skip & Close</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* COMPLETE PHASE */}
      {phase === 'complete' && (
        <>
          <div className="card card-accent" style={{ marginBottom: 32 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Session Complete</div>
            <p style={{ color: 'var(--text)', margin: 0 }}>{summary}</p>
          </div>

          <div className="section-label">Full Reflection</div>
          {matchedPatterns.map(p => (
            <div key={p.id} className="reflection-block answered" style={{ marginBottom: 24 }}>
              <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>{p.name}</div>
              <div className="question-text">{p.question}</div>
              {p.answer && <div style={{ margin: '8px 0', fontStyle: 'italic', color: 'var(--text)' }}>"{p.answer}"</div>}
              {p.aiResponse && <div className="ai-response">{p.aiResponse}</div>}
            </div>
          ))}

          <button onClick={reset} style={{ marginTop: 24 }}>New Session</button>
        </>
      )}
    </div>
  )
}
