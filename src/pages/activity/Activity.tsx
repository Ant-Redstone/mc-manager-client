import { useCallback, useEffect, useState } from 'react'
import { ScrollText, RefreshCw, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { apiFetch, authHeaders, failureMessage } from '../../lib/api'
import { getAvatarColor } from '../../lib/avatar'
import { formatWhen } from '../../lib/format'
import './Activity.css'

interface ActivityEntry {
  id: number
  created_at: string
  user_id?: number
  username: string
  category: string
  action: string
  detail?: string
  status?: number
  server_id?: string
}

/** Mirrors types.ActivityCategories on the server, in the same order. */
const CATEGORIES = [
  { key: 'server', label: 'Servidor' },
  { key: 'players', label: 'Jogadores' },
  { key: 'console', label: 'Console' },
  { key: 'files', label: 'Arquivos' },
  { key: 'backups', label: 'Backups' },
  { key: 'settings', label: 'Configurações' },
  { key: 'access', label: 'Acessos' },
] as const

const PAGE = 50

function Activity() {
  const { token } = useAuth()
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [category, setCategory] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(
    async (cat: string, before: number) => {
      const params = new URLSearchParams({ limit: String(PAGE) })
      if (cat) params.set('category', cat)
      if (before > 0) params.set('before', String(before))
      return apiFetch<ActivityEntry[]>(`/activity?${params}`, { headers: authHeaders(token) })
    },
    [token],
  )

  useEffect(() => {
    let cancelled = false
    load(category, 0).then((r) => {
      if (cancelled) return
      if (r.kind === 'ok') {
        setEntries(r.data)
        setExhausted(r.data.length < PAGE)
        setError(null)
      } else if (r.kind === 'unsupported') {
        setError('Este build do servidor ainda não registra atividade.')
      } else {
        setError(failureMessage(r, 'Não consegui carregar a atividade'))
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [load, category])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const loadMore = async () => {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoadingMore(true)
    const r = await load(category, last.id)
    setLoadingMore(false)
    if (r.kind === 'ok') {
      setEntries((e) => [...e, ...r.data])
      setExhausted(r.data.length < PAGE)
    } else {
      setError(failureMessage(r, 'Não consegui carregar mais'))
    }
  }

  const pick = (key: string) => {
    setCategory((c) => (c === key ? '' : key))
    setLoading(true)
    setExhausted(false)
  }

  return (
    <div className="act-page">
      <div className="act-head">
        <div>
          <h2>Atividade</h2>
          <p className="act-sub">Quem fez o quê, e quando. Responde “quem baniu fulano?” sem caçar no console.</p>
        </div>
        <button
          className="act-refresh"
          onClick={() => {
            setLoading(true)
            setCategory((c) => c)
            setNow(Date.now())
          }}
          disabled={loading}
          title="Atualizar"
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="act-chips">
        <button className={`act-chip ${category === '' ? 'on' : ''}`} onClick={() => pick('')}>
          Tudo
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`act-chip ${category === c.key ? 'on' : ''}`}
            aria-pressed={category === c.key}
            onClick={() => pick(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className="act-error">{error}</p>}

      {loading && <p className="act-empty">Carregando…</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="act-empty">
          {category
            ? 'Nada nessa categoria ainda.'
            : 'Nada registrado ainda. As ações aparecem aqui conforme acontecem — start/stop, bans, edições de arquivo, mudanças de cargo.'}
        </p>
      )}

      {entries.length > 0 && (
        <ul className="act-list">
          {entries.map((e, i) => (
            <li key={e.id} className="act-row stagger-item" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <span className="act-av" style={{ background: getAvatarColor(e.username) }}>
                {e.username.charAt(0).toUpperCase()}
              </span>
              <div className="act-body">
                <div className="act-line">
                  <b>{e.username}</b> {e.action}
                  <span className={`act-cat c-${e.category}`}>{e.category}</span>
                </div>
                {e.detail && <code className="act-detail">{e.detail}</code>}
              </div>
              <time className="act-when" dateTime={e.created_at} title={e.created_at}>
                {formatWhen(e.created_at, now)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && !exhausted && (
        <button className="act-more" onClick={loadMore} disabled={loadingMore}>
          <ChevronDown size={15} />
          {loadingMore ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}

      {entries.length > 0 && exhausted && (
        <p className="act-end">
          <ScrollText size={14} />
          Fim do registro. Ele guarda as ações mais recentes, não o histórico completo.
        </p>
      )}
    </div>
  )
}

export default Activity
