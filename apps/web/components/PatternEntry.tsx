import { Pattern } from '@/lib/supabase'

const FIELDS: { key: keyof Pattern; label: string }[] = [
  { key: 'core_claim',           label: 'Core Claim' },
  { key: 'structure',            label: 'Structure' },
  { key: 'conditions',           label: 'Conditions' },
  { key: 'failure_modes',        label: 'Failure Modes' },
  { key: 'situation_signature',  label: 'Situation Signature' },
  { key: 'hot_signals',          label: 'Hot Signals' },
  { key: 'leverage_points',      label: 'Leverage Points' },
  { key: 'canonical_example',    label: 'Canonical Example' },
  { key: 'counter_example',      label: 'Counter Example' },
  { key: 'application_questions',label: 'Application Questions' },
  { key: 'common_mistakes',      label: 'Common Mistakes' },
  { key: 'practitioner_notes',   label: 'Practitioner Notes' },
]

export default function PatternEntry({ pattern }: { pattern: Pattern }) {
  const diff = pattern.difficulty || 0

  return (
    <div className="pattern-entry">
      <div className="pattern-header">
        <h2>{pattern.name}</h2>
        {pattern.subtitle && <div className="subtitle">{pattern.subtitle}</div>}
        <div className="pattern-meta" style={{ marginTop: 12, marginBottom: 0 }}>
          {pattern.registers?.map(r => <span key={r} className="tag">{r}</span>)}
          {pattern.source_thinkers?.map(t => <span key={t} className="tag" style={{ opacity: 0.7 }}>{t}</span>)}
          <span className="tag">{pattern.complexity_class}</span>
          <span className="difficulty" style={{ marginLeft: 'auto' }}>
            {[1,2,3,4,5].map(i => <span key={i} className={`dot ${i <= diff ? 'filled' : ''}`} />)}
          </span>
        </div>
      </div>

      <div className="pattern-body">
        {pattern.koan && (
          <div className="pattern-koan">❧ {pattern.koan}</div>
        )}

        {FIELDS.map(({ key, label }) => {
          const val = pattern[key]
          if (!val) return null
          return (
            <div key={key} className="pattern-field">
              <label>{label}</label>
              <p>{String(val)}</p>
            </div>
          )
        })}

        {pattern.example_domains?.length > 0 && (
          <div className="pattern-field">
            <label>Example Domains</label>
            <div className="pattern-meta">
              {pattern.example_domains.map(d => <span key={d} className="tag">{d}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
