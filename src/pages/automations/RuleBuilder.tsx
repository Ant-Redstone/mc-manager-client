import { useCallback, useEffect, useState } from 'react'
import { X, Plus, ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { failureMessage } from '../../lib/api'
import { WARN_OPTIONS, formatCountdown } from '../../lib/restartPlan'
import {
  TRIGGERS,
  ACTIONS,
  buildTriggerConfig,
  readTriggerConfig,
  variablesFor,
  validateActions,
  saveRule,
  fetchWebhooks,
  type Rule,
  type Action,
  type TriggerForm,
  type Webhook,
} from '../../lib/automations'

/** The held-for choices, in seconds. Zero means "the moment it crosses". */
const WINDOWS = [0, 60, 300, 600, 900]

/**
 * formatCountdown stops at minutes, because it was written for restart
 * warnings where ten minutes is the longest thing on offer. A cooldown can be
 * six hours, and "360 minutos" is technically true and unreadable — so hours
 * are spelled here rather than by changing a helper the restart dialog depends
 * on and tests pin.
 */
function formatSpan(seconds: number): string {
  if (seconds >= 3600) {
    const h = seconds / 3600
    return `${h} hora${h === 1 ? '' : 's'}`
  }
  return formatCountdown(seconds)
}

interface Props {
  /** The rule being edited, or null to create a new one. */
  rule: Rule | null
  serverId: string
  onClose: () => void
  onSaved: () => void
}

function RuleBuilder({ rule, serverId, onClose, onSaved }: Props) {
  const { token } = useAuth()

  const [name, setName] = useState(rule?.name ?? '')
  const [triggerKind, setTriggerKind] = useState(rule?.trigger_kind ?? 'stop')
  const [triggerForm, setTriggerForm] = useState<TriggerForm>(() =>
    rule ? readTriggerConfig(rule.trigger_kind, rule.trigger_config ?? {}) : {},
  )
  const [actions, setActions] = useState<Action[]>(rule?.actions ?? [])
  const [cooldown, setCooldown] = useState(rule?.cooldown_seconds ?? 0)
  const [stopOnFailure, setStopOnFailure] = useState(rule?.stop_on_failure ?? true)
  const [deafWindow, setDeafWindow] = useState(rule?.deaf_window_seconds ?? 5)

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadHooks = useCallback(() => fetchWebhooks(token), [token])
  const applyHooks = useCallback((r: Awaited<ReturnType<typeof loadHooks>>) => {
    if (r.kind === 'ok') setWebhooks(r.data ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    loadHooks().then((r) => {
      if (!cancelled) applyHooks(r)
    })
    return () => {
      cancelled = true
    }
  }, [loadHooks, applyHooks])

  // Esc closes. Bound to the document rather than the panel so it works before
  // anything inside has been focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const shape = TRIGGERS.find((t) => t.kind === triggerKind)?.config ?? 'none'
  const vars = variablesFor(triggerKind)

  // Changing the trigger clears the form. Carrying a threshold into a console
  // rule would build a config with a key that trigger never reads.
  const pickTrigger = (kind: string) => {
    setTriggerKind(kind)
    setTriggerForm({})
  }

  const patch = (p: TriggerForm) => setTriggerForm((f) => ({ ...f, ...p }))

  const setAction = (i: number, p: Partial<Action>) =>
    setActions((as) => as.map((a, j) => (j === i ? { ...a, ...p } : a)))

  const move = (i: number, by: number) =>
    setActions((as) => {
      const to = i + by
      if (to < 0 || to >= as.length) return as
      const next = [...as]
      ;[next[i], next[to]] = [next[to], next[i]]
      return next
    })

  const submit = async () => {
    if (!name.trim()) {
      setError('a automação precisa de um nome')
      return
    }
    const bad = validateActions(actions)
    if (bad) {
      setError(bad)
      return
    }
    setError(null)
    setSaving(true)
    const r = await saveRule(token, rule?.id ?? null, {
      server_id: serverId,
      name: name.trim(),
      enabled: rule?.enabled ?? true,
      trigger_kind: triggerKind,
      trigger_config: buildTriggerConfig(triggerKind, triggerForm),
      actions,
      cooldown_seconds: cooldown,
      stop_on_failure: stopOnFailure,
      deaf_window_seconds: deafWindow,
    })
    setSaving(false)
    if (r.kind === 'ok') {
      onSaved()
      onClose()
      return
    }
    // The panel stays open with everything typed still in it. Closing on an
    // error and losing the form is the worst way to report one.
    setError(failureMessage(r, 'Não consegui salvar'))
  }

  return (
    <div className="rb-backdrop" onClick={onClose}>
      <aside
        className="rb-panel"
        role="dialog"
        aria-modal="true"
        aria-label={rule ? 'Editar automação' : 'Nova automação'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rb-head">
          <h3>{rule ? 'Editar automação' : 'Nova automação'}</h3>
          <button className="rb-x" onClick={onClose} aria-label="Fechar">
            <X size={17} />
          </button>
        </header>

        <div className="rb-body">
          <label className="rb-field">
            <span>Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: avisa quando o servidor cair"
            />
          </label>

          <section className="rb-section">
            <h4>Quando</h4>
            <select value={triggerKind} onChange={(e) => pickTrigger(e.target.value)}>
              {TRIGGERS.map((t) => (
                <option key={t.kind} value={t.kind}>
                  {t.label}
                </option>
              ))}
            </select>

            {shape === 'pattern' && (
              <label className="rb-field">
                <span>Texto ou padrão</span>
                <input
                  value={triggerForm.pattern ?? ''}
                  onChange={(e) => patch({ pattern: e.target.value })}
                  placeholder="Can't keep up"
                />
                <small>
                  Texto puro casa como pedaço da linha. Entre barras vira padrão:{' '}
                  <code>/socorro|help/</code>. Um padrão inválido não casa com nada.
                </small>
              </label>
            )}

            {shape === 'firstTime' && (
              <label className="rb-check">
                <input
                  type="checkbox"
                  checked={triggerForm.firstTimeOnly ?? false}
                  onChange={(e) => patch({ firstTimeOnly: e.target.checked })}
                />
                <span>Só na primeira vez que a pessoa entrar</span>
              </label>
            )}

            {shape === 'threshold' && (
              <div className="rb-row">
                <label className="rb-field">
                  <span>{triggerKind === 'tps' ? 'Abaixo de' : 'Acima de'}</span>
                  <input
                    type="number"
                    value={triggerForm.threshold ?? 0}
                    onChange={(e) => patch({ threshold: Number(e.target.value) })}
                  />
                </label>
                <label className="rb-field">
                  <span>Sustentado por</span>
                  <select
                    value={triggerForm.forSeconds ?? 0}
                    onChange={(e) => patch({ forSeconds: Number(e.target.value) })}
                  >
                    {WINDOWS.map((w) => (
                      <option key={w} value={w}>
                        {w === 0 ? 'assim que cruzar' : formatSpan(w)}
                      </option>
                    ))}
                  </select>
                </label>
                {triggerKind === 'disk' && (
                  <small className="rb-note">
                    O disco é do volume inteiro do host, não só deste servidor.
                  </small>
                )}
              </div>
            )}

            {shape === 'schedule' && (
              <div className="rb-row">
                <label className="rb-check">
                  <input
                    type="radio"
                    name="sched"
                    checked={(triggerForm.mode ?? 'every') === 'every'}
                    onChange={() => patch({ mode: 'every', hours: triggerForm.hours ?? 6 })}
                  />
                  <span>A cada</span>
                </label>
                <input
                  type="number"
                  className="rb-narrow"
                  min={1}
                  value={triggerForm.hours ?? 6}
                  disabled={(triggerForm.mode ?? 'every') !== 'every'}
                  onChange={(e) => patch({ hours: Number(e.target.value) })}
                />
                <span className="rb-inline">horas</span>

                <label className="rb-check">
                  <input
                    type="radio"
                    name="sched"
                    checked={triggerForm.mode === 'daily'}
                    onChange={() => patch({ mode: 'daily', time: triggerForm.time ?? '05:00' })}
                  />
                  <span>Todo dia às</span>
                </label>
                <input
                  type="time"
                  value={triggerForm.time ?? '05:00'}
                  disabled={triggerForm.mode !== 'daily'}
                  onChange={(e) => patch({ time: e.target.value })}
                />
              </div>
            )}
          </section>

          <section className="rb-section">
            <h4>Faz</h4>
            {actions.length === 0 && <p className="rb-dim">Nenhuma ação ainda.</p>}

            <ol className="rb-actions">
              {actions.map((a, i) => (
                <li key={i} className="rb-action">
                  <div className="rb-action-head">
                    <span className="rb-num">{i + 1}</span>
                    <select
                      value={a.type}
                      onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? { type: e.target.value as Action['type'] } : x)))}
                      aria-label={`Tipo da ação ${i + 1}`}
                    >
                      {ACTIONS.map((t) => (
                        <option key={t.type} value={t.type}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === actions.length - 1}
                      aria-label="Descer"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      onClick={() => setActions((as) => as.filter((_, j) => j !== i))}
                      aria-label="Remover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {a.type === 'discord' && (
                    <div className="rb-action-body">
                      {webhooks.length === 0 ? (
                        <p className="rb-warn">
                          Nenhum destino do Discord cadastrado ainda. Adicione um em Destinos, aqui
                          embaixo.
                        </p>
                      ) : (
                        <select
                          value={a.webhook_id ?? 0}
                          onChange={(e) => setAction(i, { webhook_id: Number(e.target.value) })}
                          aria-label="Destino"
                        >
                          <option value={0}>escolha um destino…</option>
                          {webhooks.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <textarea
                        value={a.message ?? ''}
                        onChange={(e) => setAction(i, { message: e.target.value })}
                        placeholder="O servidor caiu às {time}"
                        rows={2}
                        aria-label="Mensagem"
                      />
                      <VarChips vars={vars} onPick={(v) => setAction(i, { message: `${a.message ?? ''}{${v}}` })} />
                      <input
                        value={a.mention ?? ''}
                        onChange={(e) => setAction(i, { mention: e.target.value })}
                        placeholder="menção opcional: <@&123456789>"
                        aria-label="Menção"
                      />
                    </div>
                  )}

                  {a.type === 'command' && (
                    <div className="rb-action-body">
                      <input
                        value={a.command ?? ''}
                        onChange={(e) => setAction(i, { command: e.target.value })}
                        placeholder="say bem-vindo, {player}!"
                        aria-label="Comando"
                      />
                      {/* {line} is left out on purpose: a player writes it, so
                          it would let them choose what the server runs. The
                          server refuses it, and offering a chip that always
                          fails is worse than not offering it. */}
                      <VarChips
                        vars={vars.filter((v) => v !== 'line')}
                        onPick={(v) => setAction(i, { command: `${a.command ?? ''}{${v}}` })}
                      />
                    </div>
                  )}

                  {a.type === 'restart' && (
                    <div className="rb-action-body">
                      <span className="rb-label">Avisa antes, faltando:</span>
                      <div className="rb-warns">
                        {WARN_OPTIONS.map((w) => {
                          const on = (a.warnings ?? []).includes(w)
                          return (
                            <button
                              key={w}
                              className={`rb-warnchip ${on ? 'on' : ''}`}
                              aria-pressed={on}
                              onClick={() =>
                                setAction(i, {
                                  warnings: on
                                    ? (a.warnings ?? []).filter((x) => x !== w)
                                    : [...(a.warnings ?? []), w].sort((x, y) => y - x),
                                })
                              }
                            >
                              {formatCountdown(w)}
                            </button>
                          )
                        })}
                      </div>
                      <small>
                        A sequência inteira roda antes do restart, então o disparo dura o maior
                        aviso. A regra não dispara de novo enquanto isso.
                      </small>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            <button
              className="rb-add"
              onClick={() => setActions((as) => [...as, { type: 'discord' }])}
            >
              <Plus size={14} />
              Adicionar ação
            </button>
          </section>

          <section className="rb-section">
            <h4>Detalhes</h4>
            <div className="rb-row">
              <label className="rb-field">
                <span>Espera antes de poder disparar de novo</span>
                <select value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))}>
                  {[0, 60, 300, 600, 1800, 3600, 21600].map((c) => (
                    <option key={c} value={c}>
                      {c === 0 ? 'sem espera' : formatSpan(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rb-field">
                <span>Ignora o que ela mesma escreveu por</span>
                <select value={deafWindow} onChange={(e) => setDeafWindow(Number(e.target.value))}>
                  {[0, 5, 10, 30, 60].map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? 'não ignora' : `${d}s`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="rb-check">
              <input
                type="checkbox"
                checked={stopOnFailure}
                onChange={(e) => setStopOnFailure(e.target.checked)}
              />
              <span>
                Para na primeira falha
                <small>
                  Ligado, um aviso no Discord que não sai cancela o restart que vinha depois.
                  Desligado, o restart acontece mesmo sem ninguém ter sido avisado.
                </small>
              </span>
            </label>
          </section>
        </div>

        <footer className="rb-foot">
          {error && <p className="rb-error">{error}</p>}
          <div className="rb-foot-buttons">
            <button className="abtn" onClick={onClose}>
              Cancelar
            </button>
            <button className="abtn abtn-go" onClick={() => void submit()} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}

function VarChips({ vars, onPick }: { vars: string[]; onPick: (v: string) => void }) {
  return (
    <div className="rb-vars">
      {vars.map((v) => (
        <button key={v} className="rb-var" onClick={() => onPick(v)} type="button">
          {`{${v}}`}
        </button>
      ))}
    </div>
  )
}

export default RuleBuilder
