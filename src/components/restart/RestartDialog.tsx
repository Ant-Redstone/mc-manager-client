import { useEffect, useRef, useState } from 'react'
import { X, TriangleAlert, RotateCw } from 'lucide-react'
import { WARN_OPTIONS, buildRestartPlan, planDuration, formatCountdown } from '../../lib/restartPlan'
import './RestartDialog.css'

interface RestartDialogProps {
  onClose: () => void
  /** Broadcast a warning line to everyone in-game. */
  onSay: (message: string) => void
  /** Take the server down. There is no restart endpoint — see the note below. */
  onStop: () => Promise<void>
  /** Bring it back. Called once the stop resolves. */
  onStart: () => Promise<void>
}

function RestartDialog({ onClose, onSay, onStop, onStart }: RestartDialogProps) {
  const [picked, setPicked] = useState<number[]>([60])
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'counting' | 'stopping' | 'starting' | 'done' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const timers = useRef<number[]>([])

  const total = planDuration(picked)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => clearTimers, [])

  const toggle = (offset: number) =>
    setPicked((p) => (p.includes(offset) ? p.filter((o) => o !== offset) : [...p, offset]))

  const go = () => {
    const plan = buildRestartPlan(picked)
    setRunning(true)
    setPhase(total > 0 ? 'counting' : 'stopping')
    setLeft(total)

    if (total > 0) {
      const tick = window.setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000)
      timers.current.push(tick as unknown as number)
      timers.current.push(window.setTimeout(() => clearInterval(tick), total * 1000))
    }

    for (const step of plan) {
      timers.current.push(
        window.setTimeout(async () => {
          if (step.say) {
            onSay(step.say)
            return
          }
          setPhase('stopping')
          try {
            await onStop()
            setPhase('starting')
            await onStart()
            setPhase('done')
          } catch (e) {
            setError(e instanceof Error ? e.message : 'A reinicialização falhou no meio')
            setPhase('failed')
          }
        }, step.at * 1000),
      )
    }
  }

  const cancel = () => {
    clearTimers()
    setRunning(false)
    setPhase('idle')
    if (left > 0) onSay('Reinicialização cancelada')
  }

  return (
    <div className="rd-root">
      <div className="rd-scrim" onClick={running ? undefined : onClose} />
      <div className="rd-box" role="dialog" aria-modal="true" aria-label="Reiniciar o servidor">
        <header className="rd-head">
          <h3>
            <RotateCw size={16} /> Reiniciar o servidor
          </h3>
          {!running && (
            <button className="rd-x" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </button>
          )}
        </header>

        {phase === 'idle' && (
          <>
            <p className="rd-lede">
              Escolha quando avisar quem está jogando. Pode marcar mais de um — cada marca é um aviso no chat, e o
              servidor cai no mais longo deles.
            </p>

            <div className="rd-opts">
              {WARN_OPTIONS.map((o) => (
                <label key={o} className={`rd-opt ${picked.includes(o) ? 'on' : ''}`}>
                  <input type="checkbox" checked={picked.includes(o)} onChange={() => toggle(o)} />
                  {formatCountdown(o)}
                </label>
              ))}
            </div>

            {picked.length === 0 && (
              <div className="rd-warn">
                <TriangleAlert size={15} />
                <span>
                  Sem nenhum aviso marcado, o servidor cai <b>agora</b> e quem estiver online é desconectado sem
                  nenhum sinal.
                </span>
              </div>
            )}

            <div className="rd-note">
              A contagem roda <b>nesta aba</b>. Se você fechá-la antes do fim, nada acontece — o servidor continua no
              ar e ninguém é avisado de novo.
            </div>

            <footer className="rd-foot">
              <button className="rd-btn" onClick={onClose}>
                Cancelar
              </button>
              <button className={`rd-btn rd-go ${picked.length === 0 ? 'danger' : ''}`} onClick={go}>
                {picked.length === 0 ? 'Reiniciar agora' : `Avisar e reiniciar em ${formatCountdown(total)}`}
              </button>
            </footer>
          </>
        )}

        {phase === 'counting' && (
          <div className="rd-live">
            <div className="rd-count">{formatCountdown(left)}</div>
            <p className="rd-lede">
              Avisando no chat. Mantenha esta aba aberta — fechá-la cancela tudo.
            </p>
            <footer className="rd-foot">
              <button className="rd-btn rd-go" onClick={cancel}>
                Cancelar e avisar que foi cancelado
              </button>
            </footer>
          </div>
        )}

        {(phase === 'stopping' || phase === 'starting') && (
          <div className="rd-live">
            <div className="rd-count rd-count-sm">{phase === 'stopping' ? 'Parando…' : 'Subindo de volta…'}</div>
            <p className="rd-lede">O mundo salva antes de descer. Isso leva alguns segundos.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="rd-live">
            <div className="rd-count rd-count-sm">Servidor no ar</div>
            <footer className="rd-foot">
              <button className="rd-btn rd-go" onClick={onClose}>
                Fechar
              </button>
            </footer>
          </div>
        )}

        {phase === 'failed' && (
          <div className="rd-live">
            <div className="rd-warn">
              <TriangleAlert size={15} />
              <span>{error}</span>
            </div>
            <p className="rd-lede">
              Confira o estado no topo da página. Se ficou parado, use o botão Start.
            </p>
            <footer className="rd-foot">
              <button className="rd-btn rd-go" onClick={onClose}>
                Fechar
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}

export default RestartDialog
