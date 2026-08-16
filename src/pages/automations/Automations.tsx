import { useCallback, useEffect, useState } from 'react'
import type React from 'react'
import { Zap, RefreshCw, ChevronDown, Trash2, Pencil, CircleCheck, CircleX } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePermissions } from '../../context/PermissionsContext'
import { failureMessage } from '../../lib/api'
import { formatWhen } from '../../lib/format'
import {
  fetchRules,
  fetchFirings,
  deleteRule,
  setRuleEnabled,
  describeRule,
  readOutcome,
  type Rule,
  type Firing,
} from '../../lib/automations'
import './Automations.css'

function Automations() {
  const { token } = useAuth()
  const { can } = usePermissions()
  const mayManage = can('automations.manage')

  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Bumped to ask the effect for a fresh list. A refresh button that calls the
  // fetcher itself would put the setState back inside a handler chain the
  // effect already owns.
  const [reloadKey, setReloadKey] = useState(0)

  // Per-rule UI state, all keyed by id so one open rule does not affect another.
  const [expanded, setExpanded] = useState<number | null>(null)
  const [firings, setFirings] = useState<Record<number, Firing[]>>({})
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  // `load` fetches and returns; the caller applies. Keeping the setState out of
  // it is what lets the effect below call it without tripping the compiler's
  // "setState synchronously within an effect" rule, and it is the shape the
  // Activity page already uses.
  const load = useCallback(() => fetchRules(token), [token])

  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    if (r.kind === 'ok') {
      setRules(r.data ?? [])
      setError(null)
      setUnsupported(false)
    } else if (r.kind === 'unsupported') {
      // Not an error. An older server build simply does not have the endpoints,
      // and "Erro ao carregar" would send someone looking for a fault.
      setUnsupported(true)
      setError(null)
    } else {
      setError(failureMessage(r, 'Não consegui carregar as automações'))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    load().then((r) => {
      if (!cancelled) apply(r)
    })
    return () => {
      cancelled = true
    }
  }, [load, apply, reloadKey])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const toggle = async (rule: Rule) => {
    setBusy(rule.id)
    const r = await setRuleEnabled(token, rule.id, !rule.enabled)
    setBusy(null)
    if (r.kind === 'ok') {
      // Updated in place rather than refetching the list: a toggle that makes
      // the whole page flash reads as something heavier than it is.
      setRules((rs) => rs.map((x) => (x.id === rule.id ? { ...x, enabled: !x.enabled } : x)))
    } else {
      setError(failureMessage(r, 'Não consegui mudar o estado da regra'))
    }
  }

  const remove = async (id: number) => {
    setBusy(id)
    const r = await deleteRule(token, id)
    setBusy(null)
    setConfirming(null)
    if (r.kind === 'ok') {
      setRules((rs) => rs.filter((x) => x.id !== id))
    } else {
      setError(failureMessage(r, 'Não consegui apagar a regra'))
    }
  }

  const expand = async (id: number) => {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    if (firings[id]) return
    const r = await fetchFirings(token, id)
    if (r.kind === 'ok') {
      setFirings((f) => ({ ...f, [id]: r.data ?? [] }))
    } else {
      setError(failureMessage(r, 'Não consegui carregar o histórico'))
    }
  }

  return (
    <div className="auto-page">
      <div className="auto-head">
        <div>
          <h2>Automações</h2>
          <p className="auto-sub">
            Regras que rodam sozinhas: quando algo acontece no servidor, o painel responde.
          </p>
        </div>
        <button
          className="auto-refresh"
          onClick={() => {
            setLoading(true)
            setNow(Date.now())
            setReloadKey((k) => k + 1)
          }}
          disabled={loading}
          title="Atualizar"
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && <p className="auto-error">{error}</p>}

      {unsupported && (
        <p className="auto-empty">Este build do servidor ainda não tem automações.</p>
      )}

      {loading && <p className="auto-empty">Carregando…</p>}

      {!loading && !error && !unsupported && rules.length === 0 && (
        <div className="auto-blank">
          <Zap size={22} />
          <p>Nenhuma automação ainda.</p>
          <p className="auto-blank-hint">
            Uma automação junta um gatilho a uma ou mais ações — “quando o servidor cair, avisa no
            Discord”, “todo dia às 5h, faz um backup”, “se o TPS ficar abaixo de 5 por 5 minutos,
            reinicia”.
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <ul className="auto-list">
          {rules.map((r, i) => (
            <li
              key={r.id}
              className={`auto-row stagger-item ${r.enabled ? '' : 'off'}`}
              style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
            >
              <div className="auto-main">
                <div className="auto-titleline">
                  <b>{r.name}</b>
                  {!r.enabled && <span className="auto-tag">desligada</span>}
                </div>
                <p className="auto-desc">{describeRule(r)}</p>
                <div className="auto-meta">
                  <button className="auto-hist" onClick={() => void expand(r.id)}>
                    <ChevronDown size={13} className={expanded === r.id ? 'flip' : ''} />
                    Histórico
                  </button>
                  <span className="auto-fired">
                    {r.last_fired_at
                      ? `disparou ${formatWhen(r.last_fired_at, now)}`
                      : 'nunca disparou'}
                  </span>
                  {r.trigger_kind === 'disk' && (
                    <span className="auto-note">
                      o disco é do volume inteiro do host, não só deste servidor
                    </span>
                  )}
                </div>

                {expanded === r.id && (
                  <div className="auto-firings">
                    {!firings[r.id] && <p className="auto-dim">Carregando…</p>}
                    {firings[r.id]?.length === 0 && (
                      <p className="auto-dim">Ainda não disparou nenhuma vez.</p>
                    )}
                    {firings[r.id]?.map((f) => (
                      <div key={f.id} className="auto-firing">
                        <time dateTime={f.fired_at} title={f.fired_at}>
                          {formatWhen(f.fired_at, now)}
                        </time>
                        <code>{f.trigger}</code>
                        <span className="auto-steps">
                          {readOutcome(f.outcome).map((s, j) => (
                            // The recorded per-action result, not a summary of
                            // it: a firing where the Discord step failed and
                            // the restart still ran has to be readable as
                            // exactly that.
                            <span
                              key={j}
                              className={s.ok ? 'ok' : 'bad'}
                              title={s.error ?? undefined}
                            >
                              {s.ok ? <CircleCheck size={12} /> : <CircleX size={12} />}
                              {s.action}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {mayManage && (
                <div className="auto-actions">
                  {confirming === r.id ? (
                    <div className="auto-confirm">
                      <span>Apagar?</span>
                      <button
                        className="abtn abtn-danger"
                        onClick={() => void remove(r.id)}
                        disabled={busy === r.id}
                      >
                        Sim
                      </button>
                      <button className="abtn" onClick={() => setConfirming(null)}>
                        Não
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="auto-switch" title={r.enabled ? 'Desligar' : 'Ligar'}>
                        {/* The aria-label is on the INPUT, not the label. A
                            label wrapping an input names it from its text
                            content, and this one's content is an empty span —
                            so without this the switch announces as an unnamed
                            checkbox, four identical ones in a row. */}
                        <input
                          type="checkbox"
                          aria-label={`${r.enabled ? 'Desligar' : 'Ligar'} ${r.name}`}
                          checked={r.enabled}
                          disabled={busy === r.id}
                          onChange={() => void toggle(r)}
                        />
                        <span className="auto-slider" />
                      </label>
                      <button className="abtn" disabled title="Editar (em breve)">
                        <Pencil size={14} />
                      </button>
                      <button
                        className="abtn abtn-danger"
                        onClick={() => setConfirming(r.id)}
                        title="Apagar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default Automations
