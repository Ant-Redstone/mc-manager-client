import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, ChevronRight } from 'lucide-react'
import { useServer } from '../../context/ServerContext'
import { useAuth } from '../../context/AuthContext'
import PlayerPanel from '../../components/player/PlayerPanel'
import { apiFetch, authHeaders, failureMessage } from '../../lib/api'
import type { Player, WorldInfo } from '../../types/player'
import './Players.css'

const JOIN_LEAVE_PATTERN = /joined the game|left the game/

function Players() {
  const { running, subscribe } = useServer()
  const { token, logout } = useAuth()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)
  const [worldSpawn, setWorldSpawn] = useState<{ x: number; y: number; z: number } | undefined>()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [fetchTrigger, setFetchTrigger] = useState(0)

  // Fetch players when fetchTrigger changes
  useEffect(() => {
    let cancelled = false
    const headers = authHeaders(token)

    apiFetch<Player[]>('/players', { headers })
      .then((r) => {
        if (cancelled) return
        if (r.kind === 'ok') {
          const sorted = [...r.data].sort((a, b) => {
            if (a.online !== b.online) return a.online ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          setPlayers(sorted)
          setError(null) // recover from a prior transient error on refetch
        } else if (r.kind === 'unauthorized') {
          logout()
        } else if (r.kind === 'network') {
          setError('Could not connect to server')
        } else {
          setError(failureMessage(r, 'Failed to fetch players'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [token, fetchTrigger, logout])

  // World spawn (for "teleport to spawn"). Optional — degrades if unavailable.
  useEffect(() => {
    let cancelled = false
    const headers = authHeaders(token)
    apiFetch<WorldInfo>('/world', { headers }).then((r) => {
      if (cancelled) return
      if (r.kind === 'ok' && r.data?.spawn) setWorldSpawn(r.data.spawn)
      else if (r.kind === 'unauthorized') logout()
      // unsupported/error/network: no spawn data, the To-spawn button stays hidden
    })
    return () => { cancelled = true }
  }, [token, logout])

  // Subscribe to shared WebSocket for join/leave events
  useEffect(() => {
    if (!running) return

    const unsubscribe = subscribe((data) => {
      if (JOIN_LEAVE_PATTERN.test(data)) {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          setFetchTrigger((n) => n + 1)
        }, 500)
      }
    })

    return () => {
      unsubscribe()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [running, subscribe])

  const selected = selectedUuid ? players.find((p) => p.uuid === selectedUuid) ?? null : null
  const onlinePlayers = players.filter((p) => p.online)

  const closePanel = useCallback(() => setSelectedUuid(null), [])
  const refreshRoster = useCallback(() => setFetchTrigger((n) => n + 1), [])

  return (
    <>
      <div className="players-page">
        <div className="players-header">
          <h2>Players</h2>
          <button
            className="btn-refresh"
            onClick={refreshRoster}
            disabled={loading}
            aria-label="Refresh players"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>

        {loading && <p className="players-loading">Loading players…</p>}
        {error && <p className="players-error">{error}</p>}

        {!loading && !error && players.length === 0 && (
          <div className="players-empty">
            <p className="players-empty-title">No players yet</p>
            <p className="players-empty-sub">
              Once someone joins the server they'll show up here — select any player to op, teleport,
              message, or moderate them.
            </p>
          </div>
        )}

        {!loading && !error && players.length > 0 && (
          <div className="players-list">
            {players.map((player, i) => (
              <button
                key={player.uuid}
                type="button"
                className={`player-card stagger-item ${player.online ? 'online' : 'offline'} ${selectedUuid === player.uuid ? 'selected' : ''}`}
                style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                onClick={() => setSelectedUuid(player.uuid)}
                aria-haspopup="dialog"
              >
                <span className="player-status-indicator" title={player.online ? 'Online' : 'Offline'} />
                <img
                  className="player-avatar"
                  src={`https://mc-heads.net/avatar/${player.uuid}/64`}
                  alt=""
                  aria-hidden="true"
                />
                <div className="player-info">
                  <span className="player-name">{player.name}</span>
                  <div className="player-badges">
                    {player.is_op && <span className="badge badge-op">OP</span>}
                    {player.is_banned && <span className="badge badge-banned">Banned</span>}
                    {player.is_whitelisted && <span className="badge badge-whitelisted">Whitelisted</span>}
                  </div>
                </div>
                <span className="player-status-text">{player.online ? 'Online' : 'Offline'}</span>
                <ChevronRight size={16} className="player-chevron" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <PlayerPanel
          key={selected.uuid}
          player={selected}
          onlinePlayers={onlinePlayers}
          worldSpawn={worldSpawn}
          onClose={closePanel}
          onRefresh={refreshRoster}
        />
      )}
    </>
  )
}

export default Players
