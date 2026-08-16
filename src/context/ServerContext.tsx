import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useServers } from './ServersContext'
import { isChatLine, type ChatLine } from '../lib/chat'
import { apiFetch, authHeaders, failureMessage } from '../lib/api'
import { serverPath } from '../lib/servers'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080/api/console'

// WS_URL already carries the console endpoint's own final path segment
// (…/api/console, env-configurable). Splitting it there and re-deriving the
// tail through serverPath keeps this in lockstep with the REST namespacing
// below -- including the id === null case, which must reproduce WS_URL byte
// for byte so an old-backend deploy sees today's exact URL.
function namespacedWsUrl(base: string, serverId: string | null): string {
  const i = base.lastIndexOf('/')
  if (i === -1) return base
  return base.slice(0, i) + serverPath(serverId, base.slice(i))
}

type MessageListener = (data: string) => void

export interface ServerInfo {
  serverType: string
  gameVersion: string
  loaderVersion?: string
}

interface ServerContextType {
  running: boolean
  consoleConnected: boolean
  loading: boolean
  actionError: string | null
  serverExists: boolean
  serverInfo: ServerInfo | null
  logs: string[]
  chatLog: ChatLine[]
  appendLog: (line: string) => void
  clearLogs: () => void
  handleStart: () => Promise<void>
  handleStop: () => Promise<void>
  createServer: (config: CreateServerConfig) => Promise<void>
  deleteServer: () => Promise<void>
  updateProperties: (properties: Record<string, string>) => Promise<void>
  fetchProperties: () => Promise<Record<string, string>>
  sendCommand: (cmd: string) => void
  subscribe: (listener: MessageListener) => () => void
}

export interface CreateServerConfig {
  serverType: string
  releaseVersion: string
  loaderVersion?: string
  createLaunchScript: boolean
  configureProperties: boolean
  properties: Record<string, string>
}

const ServerContext = createContext<ServerContextType | null>(null)

const MAX_LOG_LINES = 1000
// Chat gets its own, larger buffer so a player's history survives even a busy
// console (chat lines are only a fraction of total server output).
const MAX_CHAT_LINES = 2000

export function ServerProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth()
  const { currentServerId } = useServers()
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [serverExists, setServerExists] = useState(false)
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [chatLog, setChatLog] = useState<ChatLine[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef<Set<MessageListener>>(new Set())
  // Reconnect bookkeeping. A dropped console can't be revived by setRunning
  // alone — React bails out on same-value setState, so the connect effect
  // never re-runs; bumping wsEpoch forces it. consoleConnected drives the UI.
  const [consoleConnected, setConsoleConnected] = useState(false)
  const [wsEpoch, setWsEpoch] = useState(0)
  const reconnectRef = useRef<{ attempt: number; timer: number | null }>({ attempt: 0, timer: null })

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => {
      const next = [...prev, line]
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
    })
  }, [])

  const clearLogs = useCallback(() => setLogs([]), [])

  const headers = authHeaders(token)

  const refreshStatus = () => {
    apiFetch<{ running: boolean }>(serverPath(currentServerId, '/status'), { headers }).then((r) => {
      if (r.kind === 'unauthorized') logout()
      else if (r.kind === 'ok') setRunning(r.data.running)
    })
  }

  // `/server` (exists/create/delete) is deliberately left on the flat route,
  // not namespaced through serverPath. It answers "does this container have
  // a Minecraft jar/world provisioned yet" -- the legacy first-run setup
  // flow -- which PLAN-multi-server.md D3's per-server list
  // ({status,start,stop,console,players,properties,files*,backups*}) doesn't
  // include. Creating a NEW registry server is a separate, not-yet-built
  // operation (POST /api/servers) -- out of scope here (see Servers.tsx).
  const refreshServerExists = () => {
    apiFetch<{ exists: boolean; serverType?: string; gameVersion?: string; loaderVersion?: string }>('/server', { headers }).then((r) => {
      if (r.kind === 'unauthorized') { logout(); return }
      if (r.kind !== 'ok') return
      setServerExists(r.data.exists)
      if (r.data.exists && r.data.serverType) {
        setServerInfo({
          serverType: r.data.serverType,
          gameVersion: r.data.gameVersion ?? '',
          loaderVersion: r.data.loaderVersion,
        })
      } else {
        setServerInfo(null)
      }
    })
  }

  const connectWs = useCallback(() => {
    if (wsRef.current) return
    // Show "reconnecting" until the handshake actually opens.
    setConsoleConnected(false)
    const ws = new WebSocket(`${namespacedWsUrl(WS_URL, currentServerId)}?token=${encodeURIComponent(token ?? '')}`)
    // Track the socket immediately, not in onopen: if it's only assigned
    // once the handshake finishes, a second connect started in the meantime
    // creates a duplicate socket, and cleanup can't close a socket it never
    // saw (it leaks and keeps streaming into the log state).
    wsRef.current = ws
    ws.onmessage = (e) => {
      appendLog(e.data)
      // Keep chat lines in their own long-lived buffer, tagged with a
      // monotonic seq so each message has a stable identity across rolls.
      if (isChatLine(e.data)) {
        setChatLog((prev) => {
          const seq = prev.length ? prev[prev.length - 1].seq + 1 : 0
          const next = [...prev, { seq, line: e.data }]
          return next.length > MAX_CHAT_LINES ? next.slice(-MAX_CHAT_LINES) : next
        })
      }
      listenersRef.current.forEach((fn) => fn(e.data))
    }
    ws.onopen = () => {
      reconnectRef.current.attempt = 0
      setConsoleConnected(true)
    }
    ws.onclose = () => {
      // A deliberate close (effect cleanup / server stop) nulls wsRef first, so
      // if it no longer points at this socket the close was intentional — don't
      // reconnect. Otherwise the socket dropped unexpectedly: reconnect.
      if (wsRef.current !== ws) return
      wsRef.current = null
      setConsoleConnected(false)
      refreshStatus()
      // Capped exponential backoff: 1s, 2s, 4s, … 30s max.
      const attempt = reconnectRef.current.attempt++
      const delay = Math.min(30_000, 1000 * 2 ** attempt)
      reconnectRef.current.timer = window.setTimeout(() => {
        reconnectRef.current.timer = null
        setWsEpoch((e) => e + 1)
      }, delay)
    }
    ws.onerror = () => {
      // The browser fires 'error' then 'close'; let onclose own teardown and
      // the reconnect so the ref isn't nulled early (which reads as deliberate).
    }
    // currentServerId here means switching servers naturally reconnects: this
    // callback's identity changes, which re-runs the lifecycle effect below,
    // whose cleanup closes the old socket (nulling wsRef first, so the old
    // socket's onclose reads it as deliberate and skips the backoff) before
    // the effect body calls connectWs() again against the new URL.
  }, [token, currentServerId])

  // Manage the WebSocket lifecycle. wsEpoch is bumped by the reconnect timer so
  // a dropped socket re-runs this effect and reconnects.
  useEffect(() => {
    // Capture the (stable, never-reassigned) bookkeeping object so the cleanup
    // reads the same instance without touching reconnectRef.current there.
    const reconnect = reconnectRef.current
    if (running) {
      connectWs()
    } else {
      wsRef.current?.close()
      wsRef.current = null
    }
    return () => {
      // Cancel any pending reconnect so a deliberate stop/unmount can't
      // resurrect the socket against a stopped server.
      if (reconnect.timer !== null) {
        window.clearTimeout(reconnect.timer)
        reconnect.timer = null
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [running, wsEpoch, connectWs])

  const sendCommand = useCallback((cmd: string) => {
    // The ref is set while the socket is still connecting; send() on a
    // CONNECTING socket throws, so only send once it's open.
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd)
    }
  }, [])

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }, [])

  // currentServerId in the deps: switching servers re-checks immediately
  // instead of waiting up to 5s for the next tick, and restarts the interval
  // so its closure captures the new server (refreshStatus is redefined every
  // render, so a setInterval from a stale render would otherwise keep
  // polling whichever server was selected when this effect last ran).
  useEffect(() => {
    refreshStatus()
    refreshServerExists()
    // Keep the running state honest even when nothing reconnects the
    // WebSocket (e.g. the server was started/stopped from another session
    // or crashed silently).
    const id = setInterval(refreshStatus, 5000)
    return () => clearInterval(id)
  }, [currentServerId])

  const handleStart = async () => {
    setLoading(true)
    setActionError(null)
    const r = await apiFetch(serverPath(currentServerId, '/start'), { method: 'POST', headers })
    if (r.kind === 'ok') setRunning(true)
    else if (r.kind === 'unauthorized') logout()
    else if (r.kind === 'network') setActionError('Could not reach the server')
    else setActionError(failureMessage(r, 'Failed to start the server'))
    setLoading(false)
  }

  const handleStop = async () => {
    setLoading(true)
    setActionError(null)
    const r = await apiFetch(serverPath(currentServerId, '/stop'), { method: 'POST', headers })
    if (r.kind === 'ok') setRunning(false)
    else if (r.kind === 'unauthorized') logout()
    else if (r.kind === 'network') setActionError('Could not reach the server')
    else setActionError(failureMessage(r, 'Failed to stop the server'))
    setLoading(false)
  }

  const createServer = async (config: CreateServerConfig) => {
    setLoading(true)
    try {
      const r = await apiFetch('/server', { method: 'POST', headers, body: JSON.stringify(config) })
      if (r.kind === 'unauthorized') { logout(); throw new Error('Session expired') }
      if (r.kind !== 'ok') {
        throw new Error(failureMessage(r, r.kind === 'network' ? 'Could not reach the server' : 'Failed to create server'))
      }
      setServerExists(true)
      setServerInfo({
        serverType: config.serverType,
        gameVersion: config.releaseVersion,
        loaderVersion: config.loaderVersion,
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteServer = async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/server', { method: 'DELETE', headers })
      if (r.kind === 'unauthorized') { logout(); throw new Error('Session expired') }
      if (r.kind !== 'ok') {
        throw new Error(failureMessage(r, r.kind === 'network' ? 'Could not reach the server' : 'Failed to delete server'))
      }
      setServerExists(false)
      setServerInfo(null)
    } finally {
      setLoading(false)
    }
  }

  const updateProperties = async (properties: Record<string, string>) => {
    const r = await apiFetch(serverPath(currentServerId, '/properties'), { method: 'PATCH', headers, body: JSON.stringify({ properties }) })
    if (r.kind === 'unauthorized') { logout(); return }
    if (r.kind !== 'ok') {
      throw new Error(failureMessage(r, r.kind === 'network' ? 'Could not reach the server' : 'Failed to update properties'))
    }
  }

  const fetchProperties = async (): Promise<Record<string, string>> => {
    const r = await apiFetch<Record<string, string>>(serverPath(currentServerId, '/properties'), { headers })
    if (r.kind === 'unauthorized') { logout(); return {} }
    if (r.kind !== 'ok') {
      throw new Error(failureMessage(r, r.kind === 'network' ? 'Could not reach the server' : 'Failed to fetch properties'))
    }
    return r.data
  }

  return (
    <ServerContext.Provider value={{ running, consoleConnected, loading, actionError, serverExists, serverInfo, logs, chatLog, appendLog, clearLogs, handleStart, handleStop, createServer, deleteServer, updateProperties, fetchProperties, sendCommand, subscribe }}>
      {children}
    </ServerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useServer() {
  const context = useContext(ServerContext)
  if (!context) throw new Error('useServer must be used within ServerProvider')
  return context
}
