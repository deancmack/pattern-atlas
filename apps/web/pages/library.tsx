import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'

type PatternRow = {
  id: string
  name: string
  subtitle: string | null
  register: string
  registers: string[]
  source_thinkers: string[]
  complexity_class: string | null
  difficulty: number | null
  field_tested: boolean
  koan: string | null
}

type SortKey = 'name' | 'register' | 'complexity_class' | 'difficulty'
type SortDir = 'asc' | 'desc'

const REGISTERS = ['becoming','rupture','relation','observation','stabilization','concealment','power','ideology','desire','contradiction','flow','configuration','interdependence','withdrawal','foundation','practitioner']

export default function LibraryPage() {
  const [patterns, setPatterns] = useState<PatternRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRegister, setFilterRegister] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/patterns')
      .then(r => r.json())
      .then(d => { setPatterns(d.patterns || []); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    let rows = [...patterns]

    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.subtitle?.toLowerCase().includes(q) ||
        p.source_thinkers?.some(t => t.toLowerCase().includes(q)) ||
        p.koan?.toLowerCase().includes(q)
      )
    }

    if (filterRegister) {
      rows = rows.filter(p => p.registers?.includes(filterRegister))
    }

    if (filterDifficulty) {
      rows = rows.filter(p => String(p.difficulty) === filterDifficulty)
    }

    rows.sort((a, b) => {
      let av = (a[sortKey] ?? '') as any
      let bv = (b[sortKey] ?? '') as any
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return rows
  }, [patterns, search, filterRegister, filterDifficulty, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span style={{ color: 'var(--border)', marginLeft: 4 }}>↕</span>
    return <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="container-wide">
      <h1>Pattern Library</h1>
      <p className="lead" style={{ marginBottom: 24 }}>
        {patterns.length} patterns. Browse, search, and sort the full atlas.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, thinker, koan…"
          style={{ flex: '1 1 240px', minWidth: 200 }}
        />
        <select
          value={filterRegister}
          onChange={e => setFilterRegister(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '14px 16px', borderRadius: 6, fontSize: 15 }}
        >
          <option value="">All registers</option>
          {REGISTERS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={filterDifficulty}
          onChange={e => setFilterDifficulty(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '14px 16px', borderRadius: 6, fontSize: 15 }}
        >
          <option value="">All difficulties</option>
          {[1,2,3,4,5].map(d => <option key={d} value={d}>{'●'.repeat(d)}{'○'.repeat(5-d)}</option>)}
        </select>
        {(search || filterRegister || filterDifficulty) && (
          <button className="ghost" onClick={() => { setSearch(''); setFilterRegister(''); setFilterDifficulty('') }}>
            Clear filters
          </button>
        )}
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
        {filtered.length} of {patterns.length} patterns
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading pattern library…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th onClick={() => toggleSort('name')} style={thStyle}>
                  Pattern <SortArrow k="name" />
                </th>
                <th onClick={() => toggleSort('register')} style={thStyle}>
                  Register <SortArrow k="register" />
                </th>
                <th onClick={() => toggleSort('complexity_class')} style={thStyle}>
                  Class <SortArrow k="complexity_class" />
                </th>
                <th style={thStyle}>Thinkers</th>
                <th onClick={() => toggleSort('difficulty')} style={{ ...thStyle, textAlign: 'center' }}>
                  Diff <SortArrow k="difficulty" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <>
                  <tr
                    key={p.id}
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: expanded === p.id ? 'var(--accent-dim)' : 'transparent',
                      transition: 'background 0.1s'
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                      {p.subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{p.subtitle}</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {p.registers?.map(r => (
                          <span key={r} className="tag" style={{ fontSize: 11 }}>{r}</span>
                        ))}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span className="tag" style={{ fontSize: 11 }}>{p.complexity_class}</span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--muted)', fontSize: 13 }}>
                      {p.source_thinkers?.join(', ')}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {p.difficulty && (
                        <span title={`Difficulty ${p.difficulty}/5`}>
                          {'●'.repeat(p.difficulty)}{'○'.repeat(5 - p.difficulty)}
                        </span>
                      )}
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr key={`${p.id}-exp`} style={{ background: 'var(--accent-dim)' }}>
                      <td colSpan={5} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                        {p.koan && (
                          <div style={{ fontStyle: 'italic', color: 'var(--accent)', fontSize: 15, marginBottom: 12 }}>
                            ❧ {p.koan}
                          </div>
                        )}
                        <Link href={`/agent`} style={{ fontSize: 13 }}>
                          Use in Agent →
                        </Link>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  color: 'var(--muted)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap'
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'top'
}
