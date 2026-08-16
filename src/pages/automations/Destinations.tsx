import { useCallback, useEffect, useState } from 'react'
import { Plus, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { failureMessage } from '../../lib/api'
import { formatWhen } from '../../lib/format'
import {
  fetchWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
  type Webhook,
} from '../../lib/automations'

interface Props {
  /** Whether this account may create, delete and test destinations. */
  mayManage: boolean
  /** Called after any change, so an open builder can pick up a new destination. */
  onChanged: () => void
}

/**
 * The destinations a Discord action can point at.
 *
 * The URL is a credential. It never comes back from the API, so there is no
 * field showing it and no way to edit one -- changing a URL means deleting the
 * destination and adding it again. That is the honest shape given the server
 * will not hand it over, and pretending otherwise would mean keeping a copy
 * somewhere it should not be.
 */
function Destinations({ mayManage, onChanged }: Props) {
  const { token } = useAuth()

  const [hooks, setHooks] = useState<Webhook[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [reloadKey, setReloadKey] = useState(0)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)

  const load = useCallback(() => fetchWebhooks(token), [token])
  const apply = useCallback((r: Awaited<ReturnType<typeof load>>) => {
    if (r.kind === 'ok') {
      setHooks(r.data ?? [])
    } else if (r.kind !== 'unsupported') {
      setError(failureMessage(r, 'Não consegui carregar os destinos'))
    }
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

  // A ticking clock rather than a stamp taken on each refresh: `refresh` is
  // declared during render, and calling Date.now() from there is impure. The
  // interval keeps "funcionando · 2 min atrás" honest anyway, which is the only
  // thing `now` feeds.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const refresh = () => {
    setReloadKey((k) => k + 1)
    onChanged()
  }

  const add = async () => {
    setError(null)
    const r = await createWebhook(token, name.trim(), url.trim())
    if (r.kind === 'ok') {
      setName('')
      setUrl('')
      setAdding(false)
      refresh()
      return
    }
    // The server's own wording, not ours. It says where to copy the URL from,
    // which is more useful than anything this screen could invent.
    setError(failureMessage(r, 'Não consegui adicionar o destino'))
  }

  const remove = async (id: number) => {
    setBusy(id)
    const r = await deleteWebhook(token, id)
    setBusy(null)
    setConfirming(null)
    if (r.kind === 'ok') {
      refresh()
      return
    }
    // A 409 arrives here naming the rules still using it. That list is the
    // only thing that says WHICH rules are holding it, so it is shown whole.
    setError(failureMessage(r, 'Não consegui apagar o destino'))
  }

  const test = async (id: number) => {
    setBusy(id)
    setError(null)
    const r = await testWebhook(token, id)
    setBusy(null)
    // 200 either way: our side worked, Discord may still have refused. So the
    // kind decides, not the status -- and the list is reloaded so the recorded
    // result shows up where it belongs.
    if (r.kind !== 'ok') {
      setError(failureMessage(r, 'A entrega falhou'))
    }
    refresh()
  }

  const status = (w: Webhook) => {
    // Never tested and working must not look the same. This is the entire
    // reason the test endpoint exists.
    if (w.last_status == null) return { cls: 'untested', text: 'nunca testado' }
    if (w.last_status >= 200 && w.last_status < 300) {
      return {
        cls: 'ok',
        text: w.last_used_at ? `funcionando · ${formatWhen(w.last_used_at, now)}` : 'funcionando',
      }
    }
    return { cls: 'bad', text: w.last_error ?? `recusado com ${w.last_status}` }
  }

  return (
    <section className="dest">
      <div className="dest-head">
        <h3>Destinos do Discord</h3>
        {mayManage && !adding && (
          <button className="abtn" onClick={() => setAdding(true)}>
            <Plus size={14} />
            Adicionar
          </button>
        )}
      </div>

      {error && <p className="auto-error">{error}</p>}

      {adding && (
        <div className="dest-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome, ex: alertas"
            aria-label="Nome do destino"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            aria-label="URL do webhook"
          />
          <button className="abtn abtn-go" onClick={() => void add()}>
            Salvar
          </button>
          <button
            className="abtn"
            onClick={() => {
              setAdding(false)
              setError(null)
            }}
          >
            Cancelar
          </button>
          <small>
            Copie em Configurações do servidor &gt; Integrações &gt; Webhooks. A URL fica só no
            servidor: ela não volta pela API e não aparece aqui depois de salva.
          </small>
        </div>
      )}

      {hooks.length === 0 && !adding && (
        <p className="auto-dim">Nenhum destino ainda. Uma ação do Discord precisa de um.</p>
      )}

      {hooks.length > 0 && (
        <ul className="dest-list">
          {hooks.map((w) => {
            const s = status(w)
            return (
              <li key={w.id} className="dest-row">
                <div className="dest-main">
                  <b>{w.name}</b>
                  <span className={`dest-status ${s.cls}`}>{s.text}</span>
                </div>
                {mayManage && (
                  <div className="dest-actions">
                    {confirming === w.id ? (
                      <div className="auto-confirm">
                        <span>Apagar?</span>
                        <button
                          className="abtn abtn-danger"
                          onClick={() => void remove(w.id)}
                          disabled={busy === w.id}
                        >
                          Sim
                        </button>
                        <button className="abtn" onClick={() => setConfirming(null)}>
                          Não
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="abtn"
                          onClick={() => void test(w.id)}
                          disabled={busy === w.id}
                          aria-label={`Testar ${w.name}`}
                          title="Manda uma mensagem de verdade"
                        >
                          <Send size={14} />
                          {busy === w.id ? 'Enviando…' : 'Testar'}
                        </button>
                        <button
                          className="abtn abtn-danger"
                          onClick={() => setConfirming(w.id)}
                          aria-label={`Apagar ${w.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default Destinations
