import { useEffect, useState } from 'react'
import { Server as ServerIcon, RefreshCw, Play, Square, Users, Clock, MemoryStick, Plus, ShieldOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServers } from '../../context/ServersContext'
import { useToast } from '../../components/toast/ToastContext'
import { apiFetch, authHeaders, failureMessage } from '../../lib/api'
import { fetchServerStatus, startServer, stopServer, serverPath, parseMemSpecMb, type ServerInfo } from '../../lib/servers'
import type { Player } from '../../types/player'
import './Servers.css'

// Fixed visual scale for the memory bar. There's no host-RAM endpoint (see
// PLAN-multi-server.md's overcommit risk row -- that's still open work), so
// this can only show *configured* Xmx relative to a generous reference, not
// real headroom. Labeled "allocation" rather than "usage" so it never
// implies live data it doesn't have.
const MEMORY_BAR_REFERENCE_MB = 8192

interface CardState {
  running: boolean | null
  online: number | null
}

function Servers() {
  const { token } = useAuth()
  const { supported, forbidden, loading, servers, currentServerId, setCurrentServer, refresh } = useServers()
  const { toast } = useToast()
  const [cards, setCards] = useState<Record<string, CardState>>({})
  const [acting, setActing] = useState<Record<string, boolean>>({})

  // Per-card status + online-player count. Independent of the registry fetch
  // above (which only knows id/name/dir/port/jar/xms/xmx) -- status and
  // players are separate per-server endpoints (PLAN-multi-server.md D3), and
  // a single server's fetch failing shouldn't blank out the rest of the grid.
  useEffect(() => {
    if (!supported || servers.length === 0) return
    let cancelled = false
    Promise.all(
      servers.map(async (s) => {
        const [statusRes, playersRes] = await Promise.all([
          fetchServerStatus(token, s.id),
          apiFetch<Player[]>(serverPath(s.id, '/players'), { headers: authHeaders(token) }),
        ])
        const running = statusRes.kind === 'ok' ? statusRes.data.running : null
        const online = playersRes.kind === 'ok' ? playersRes.data.filter((p) => p.online).length : null
        return [s.id, { running, online }] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      setCards(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [supported, servers, token])

  const toggle = async (server: ServerInfo) => {
    const running = cards[server.id]?.running
    if (running == null) return
    setActing((a) => ({ ...a, [server.id]: true }))
    const r = running ? await stopServer(token, server.id) : await startServer(token, server.id)
    setActing((a) => ({ ...a, [server.id]: false }))
    if (r.kind === 'ok') {
      setCards((c) => ({ ...c, [server.id]: { ...c[server.id], running: !running } }))
      toast(`${server.name} is ${running ? 'stopping' : 'starting'}…`, 'success')
    } else if (r.kind === 'unauthorized') {
      toast('Session expired — please sign in again', 'error')
    } else if (r.kind === 'unsupported') {
      toast('This server build doesn’t support per-server start/stop yet', 'error')
    } else if (r.kind === 'network') {
      toast('Could not reach the server', 'error')
    } else {
      toast(failureMessage(r, `Failed to ${running ? 'stop' : 'start'} ${server.name}`), 'error')
    }
  }

  return (
    <div className="servers-page">
      <div className="servers-head">
        <div>
          <h2>Servers</h2>
          <p className="servers-note">Every other page operates on whichever server is Managed here.</p>
        </div>
        <div className="servers-head-actions">
          <button type="button" className="svbtn" onClick={refresh} disabled={loading} title="Refresh">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="svbtn"
            disabled
            title="Coming soon — creating servers from the panel isn’t available yet"
          >
            <Plus size={15} />
            New server
          </button>
        </div>
      </div>

      {loading && <p className="servers-loading">Loading…</p>}

      {/* Two very different reasons this page can be empty, and telling them
          apart is the whole point: one is fixed by deploying a backend, the
          other by an admin granting a permission. Collapsing both into a
          single "unavailable" is what makes people debug the wrong system. */}
      {!loading && !supported && forbidden && (
        <div className="servers-empty">
          <ShieldOff size={22} />
          <p>Your account doesn’t have permission to view the server list.</p>
          <p className="servers-empty-sub">
            Ask an admin to grant you <code>servers.view</code> on the Users page. Nothing is wrong with the server
            itself — everything you do have access to keeps working.
          </p>
        </div>
      )}

      {!loading && !supported && !forbidden && (
        <div className="servers-empty">
          <ServerIcon size={22} />
          <p>This server build doesn’t include the multi-server registry yet, so this page isn’t available.</p>
          <p className="servers-empty-sub">
            Everything else keeps working on its usual server — this page lights up automatically once the backend
            adds <code>/api/servers</code>.
          </p>
        </div>
      )}

      {!loading && supported && servers.length === 0 && (
        <div className="servers-empty">
          <ServerIcon size={22} />
          <p>No servers registered.</p>
        </div>
      )}

      {!loading && supported && servers.length > 0 && (
        <div className="servers-grid">
          {servers.map((server, i) => {
            const card = cards[server.id]
            const running = card?.running ?? null
            const isCurrent = server.id === currentServerId
            const isActing = !!acting[server.id]
            const xmxMb = parseMemSpecMb(server.xmx)
            const memPct = xmxMb ? Math.min(100, Math.max(4, (xmxMb / MEMORY_BAR_REFERENCE_MB) * 100)) : 0

            return (
              <div
                key={server.id}
                className={`server-card stagger-item ${isCurrent ? 'is-current' : ''}`}
                style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
              >
                {isCurrent && <span className="server-card-badge">Current</span>}

                <div className="server-card-head">
                  <span className={`server-dot ${running === true ? 'online' : running === false ? 'offline' : 'unknown'}`} />
                  <h3 className="server-card-name">{server.name}</h3>
                  <span className="server-card-state">
                    {running === true ? 'Running' : running === false ? 'Stopped' : 'Unknown'}
                  </span>
                </div>

                <p className="server-card-meta">
                  {server.jar} · port {server.port}
                  {server.voice_port ? ` · voice ${server.voice_port}` : ''}
                </p>

                <div className="server-card-stats">
                  <span className="server-stat">
                    <Users size={13} />
                    {card?.online != null ? `${card.online} online` : '—'}
                  </span>
                  <span className="server-stat">
                    <Clock size={13} />
                    {/* No `since` timestamp is exposed by the API yet (the
                        supervisor's ServerRuntimeStatus isn't serialized to
                        JSON beyond `running` -- see lib/servers.ts). Showing
                        a fabricated duration would break this app's honest-
                        status convention, so this stays a placeholder until
                        the backend adds it. */}
                    Uptime —
                  </span>
                </div>

                <div className="server-mem">
                  <div className="server-mem-label">
                    <MemoryStick size={12} />
                    <span>Xms {server.xms} · Xmx {server.xmx}</span>
                  </div>
                  <div className="server-mem-track">
                    <div className="server-mem-fill" style={{ width: `${memPct}%` }} />
                  </div>
                </div>

                <div className="server-card-actions">
                  <button
                    type="button"
                    className="svbtn svbtn-primary"
                    onClick={() => setCurrentServer(server.id)}
                    disabled={isCurrent}
                  >
                    {isCurrent ? 'Managing' : 'Manage'}
                  </button>
                  <button
                    type="button"
                    className={`svbtn svbtn-icon ${running ? 'svbtn-danger-ghost' : ''}`}
                    onClick={() => toggle(server)}
                    disabled={running === null || isActing}
                    title={running === null ? 'Waiting for status…' : running ? `Stop ${server.name}` : `Start ${server.name}`}
                    aria-label={running ? `Stop ${server.name}` : `Start ${server.name}`}
                  >
                    {running ? <Square size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>
            )
          })}

          <button
            type="button"
            className="server-card server-card-new"
            disabled
            title="Coming soon — creating servers from the panel isn’t available yet"
          >
            <Plus size={22} />
            <span>New server</span>
            <span className="server-card-new-sub">Coming soon</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default Servers
