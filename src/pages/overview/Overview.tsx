import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Archive, Activity, MemoryStick, RotateCw, ArrowRight, Server as ServerIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServer } from '../../context/ServerContext'
import { usePermissions } from '../../context/PermissionsContext'
import { useToast } from '../../components/toast/ToastContext'
import { apiFetch, authHeaders, failureMessage } from '../../lib/api'
import { classifyLine, type ConsoleLine } from '../../lib/consoleLines'
import { loadHistory } from '../../lib/sparkHistory'
import { getAvatarColor } from '../../lib/avatar'
import { formatBytes, formatWhen } from '../../lib/format'
import RestartDialog from '../../components/restart/RestartDialog'
import type { Player } from '../../types/player'
import './Overview.css'

interface BackupInfo {
  name: string
  size: number
  created: string
}

const EVENTS_SHOWN = 6

/** Console lines worth surfacing here — the things an operator would want to
 *  have noticed without reading the whole console. Chat is deliberately out:
 *  it's a stream, not an event, and it would drown everything else. */
const EVENT_TYPES = new Set(['join', 'leave', 'death', 'adv', 'warn', 'error'])

function Overview() {
  const { token } = useAuth()
  const { can } = usePermissions()
  const { toast } = useToast()
  const { running, logs, sendCommand, handleStart, handleStop, serverInfo } = useServer()

  const [players, setPlayers] = useState<Player[] | null>(null)
  const [playersDenied, setPlayersDenied] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null)
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  // Relative timestamps need a clock, and Date.now() during render is a
  // purity error -- same pattern the Performance page uses.
  const [now, setNow] = useState(() => Date.now())

  // The sampled vitals the Performance page keeps in localStorage. Read once
  // on mount rather than polled: this page shows the last known reading, and
  // Performance is what actually samples.
  const [vitals] = useState(() => {
    const history = loadHistory()
    return history.length > 0 ? history[history.length - 1] : null
  })

  useEffect(() => {
    let cancelled = false

    apiFetch<Player[]>('/players', { headers: authHeaders(token) }).then((r) => {
      if (cancelled) return
      if (r.kind === 'ok') setPlayers(r.data)
      else if (r.kind === 'forbidden') setPlayersDenied(true)
      else setPlayers([])
    })

    apiFetch<Record<string, string>>('/properties', { headers: authHeaders(token) }).then((r) => {
      if (cancelled) return
      if (r.kind === 'ok') {
        const n = Number(r.data['max-players'])
        if (Number.isFinite(n) && n > 0) setMaxPlayers(n)
      }
    })

    apiFetch<BackupInfo[]>('/backups', { headers: authHeaders(token) }).then((r) => {
      if (cancelled) return
      setBackups(r.kind === 'ok' ? r.data : [])
    })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const online = useMemo(() => (players ?? []).filter((p) => p.online), [players])

  // The console buffer, newest first, filtered to the kinds worth a glance.
  const events = useMemo(() => {
    const out: ConsoleLine[] = []
    for (let i = logs.length - 1; i >= 0 && out.length < EVENTS_SHOWN; i--) {
      const line = classifyLine(logs[i])
      if (!line.quiet && EVENT_TYPES.has(line.type)) out.push(line)
    }
    return out
  }, [logs])

  const lastBackup = backups && backups.length > 0 ? backups[0] : null

  const runBackup = async () => {
    setBackingUp(true)
    const r = await apiFetch<BackupInfo>('/backups', { method: 'POST', headers: authHeaders(token) })
    setBackingUp(false)
    if (r.kind === 'ok') {
      setBackups((b) => [r.data, ...(b ?? [])])
      toast(`Backup criado — ${r.data.name}`, 'success')
    } else {
      toast(failureMessage(r, 'Não consegui criar o backup'), 'error')
    }
  }

  return (
    <div className="ov-page">
      <div className="ov-head">
        <h2>Overview</h2>
        <p className="ov-sub">Se o servidor está bem, dá pra ver daqui em cinco segundos.</p>
      </div>

      <div className="ov-tiles">
        <div className="ov-tile stagger-item" style={{ '--i': 0 } as React.CSSProperties}>
          <span className="ov-tile-label">
            <ServerIcon size={13} /> Servidor
          </span>
          <span className="ov-tile-value">
            <span className={`ov-dot ${running ? 'on' : 'off'}`} />
            {running ? 'No ar' : 'Parado'}
          </span>
          <span className="ov-tile-foot">
            {serverInfo ? `${serverInfo.serverType} ${serverInfo.gameVersion}` : '—'}
          </span>
        </div>

        <div className="ov-tile stagger-item" style={{ '--i': 1 } as React.CSSProperties}>
          <span className="ov-tile-label">
            <Users size={13} /> Jogadores
          </span>
          <span className="ov-tile-value">
            {playersDenied ? '—' : online.length}
            {maxPlayers != null && !playersDenied && <span className="ov-tile-of">/ {maxPlayers}</span>}
          </span>
          <span className="ov-tile-foot">
            {playersDenied ? 'sem permissão' : online.length === 0 ? 'ninguém agora' : 'online agora'}
          </span>
        </div>

        <div className="ov-tile stagger-item" style={{ '--i': 2 } as React.CSSProperties}>
          <span className="ov-tile-label">
            <Activity size={13} /> TPS
          </span>
          <span className="ov-tile-value">{vitals?.tps != null ? vitals.tps.toFixed(1) : '—'}</span>
          <span className="ov-tile-foot">
            {vitals?.tps != null ? `medido ${formatWhen(new Date(vitals.t).toISOString(), now)}` : (
              <Link to="/performance">medir na Performance</Link>
            )}
          </span>
        </div>

        <div className="ov-tile stagger-item" style={{ '--i': 3 } as React.CSSProperties}>
          <span className="ov-tile-label">
            <MemoryStick size={13} /> Memória
          </span>
          <span className="ov-tile-value">
            {vitals?.mem != null ? formatBytes(vitals.mem) : '—'}
          </span>
          <span className="ov-tile-foot">
            {vitals?.mem != null ? 'último uso lido' : (
              <Link to="/performance">medir na Performance</Link>
            )}
          </span>
        </div>
      </div>

      <div className="ov-cols">
        <section className="ov-card">
          <header className="ov-card-head">
            <h3>Acontecendo</h3>
            <Link to="/" className="ov-more">
              ver o console <ArrowRight size={13} />
            </Link>
          </header>

          {events.length === 0 ? (
            <p className="ov-empty">
              Nada ainda nesta sessão. Os eventos aparecem conforme chegam pelo console — abra o Console e deixe
              conectado.
            </p>
          ) : (
            <ul className="ov-events">
              {events.map((e, i) => (
                <li key={`${e.raw}-${i}`} className={`ov-event t-${e.type}`}>
                  <span className="ov-event-time">{e.time ?? '--:--'}</span>
                  <span className="ov-event-body">
                    {e.who && <b>{e.who}</b>}
                    {e.type === 'join' && ' entrou'}
                    {e.type === 'leave' && ' saiu'}
                    {e.type === 'adv' && ` conquistou ${e.adv}`}
                    {(e.type === 'death' || e.type === 'warn' || e.type === 'error') && ` ${e.text ?? ''}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="ov-side">
          <section className="ov-card">
            <header className="ov-card-head">
              <h3>Online agora</h3>
              <Link to="/players" className="ov-more">
                jogadores <ArrowRight size={13} />
              </Link>
            </header>

            {playersDenied ? (
              <p className="ov-empty">Sua conta não tem permissão para ver a lista de jogadores.</p>
            ) : online.length === 0 ? (
              <p className="ov-empty">Ninguém online.</p>
            ) : (
              <ul className="ov-online">
                {online.map((p) => (
                  <li key={p.uuid || p.name}>
                    <span className="ov-av" style={{ background: getAvatarColor(p.name) }}>
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    {p.name}
                    {p.is_op && <span className="ov-op">op</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ov-card">
            <header className="ov-card-head">
              <h3>Backup</h3>
              <Link to="/backups" className="ov-more">
                todos <ArrowRight size={13} />
              </Link>
            </header>
            <p className="ov-backup">
              {lastBackup ? (
                <>
                  <Archive size={14} />
                  <span>
                    {formatWhen(lastBackup.created, now)} · {formatBytes(lastBackup.size)}
                  </span>
                </>
              ) : (
                <span className="ov-empty">Nenhum backup ainda.</span>
              )}
            </p>

            <div className="ov-actions">
              {can('backups.create') && (
                <button className="ov-act" onClick={runBackup} disabled={backingUp}>
                  <Archive size={14} />
                  {backingUp ? 'Criando…' : 'Fazer backup agora'}
                </button>
              )}
              {can('server.stop') && can('server.start') && (
                <button className="ov-act" onClick={() => setRestartOpen(true)} disabled={!running}>
                  <RotateCw size={14} />
                  Reiniciar…
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {restartOpen && (
        <RestartDialog
          onClose={() => setRestartOpen(false)}
          onSay={(m) => sendCommand(`say ${m}`)}
          onStop={handleStop}
          onStart={handleStart}
        />
      )}
    </div>
  )
}

export default Overview
