import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Trash2, Download, Trophy, Skull, LogIn, LogOut, MapPin, X, EyeOff, ChevronDown, Zap } from 'lucide-react'
import { useServer } from '../../context/ServerContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/toast/ToastContext'
import { getSuggestions, isCommandName, type Suggestion } from '../../lib/mcCommands'
import { parseConsoleInput } from '../../lib/consoleInput'
import {
  classifyLine, contentOf, parseScoreLine, parseWaypointLine, parseSessionLine,
  isUnknownObjective, noScoreObjective, nameColor, matchesHideRules,
  type ConsoleLine, type LineType,
} from '../../lib/consoleLines'
import { loadConsolePrefs, saveConsolePrefs, type ConsolePrefs, type ConsoleView } from '../../lib/consolePrefs'
import { sparkFoldCategory, foldSparkBlocks, type SparkFoldCategory } from '../../lib/spark'
import { apiFetch, authHeaders } from '../../lib/api'
import { formatPlaytime } from '../../lib/playtime'
import { isValidName, teleportToCoordsCommand, broadcastCommands } from '../../lib/playerCommands'
import type { Player } from '../../types/player'
import './Console.css'

// Display metadata per event type (chip label, accent, feed gutter icon).
const TYPE_META: Record<LineType, { label: string; color: string; icon?: React.ReactNode }> = {
  chat: { label: 'Chat', color: '#4ecca3' },
  join: { label: 'Joins', color: '#5fc47f', icon: <LogIn size={14} /> },
  leave: { label: 'Leaves', color: '#8b93b8', icon: <LogOut size={14} /> },
  adv: { label: 'Advancements', color: '#e8b64c', icon: <Trophy size={14} /> },
  death: { label: 'Deaths', color: '#e46b74', icon: <Skull size={14} /> },
  cmd: { label: 'Commands', color: '#6ea8e6' },
  warn: { label: 'Warnings', color: '#e0a33e' },
  error: { label: 'Errors', color: '#e46b74' },
  system: { label: 'System', color: '#8b93b8' },
}
const CHIP_ORDER: LineType[] = ['chat', 'join', 'leave', 'adv', 'death', 'cmd', 'warn', 'error', 'system']
const VIEWS: { id: ConsoleView; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'term', label: 'Terminal+' },
  { id: 'raw', label: 'Raw' },
]

const SPARK_SHOW_LABELS: Record<SparkFoldCategory, string> = { echo: 'Queries', response: 'Responses', monitor: 'Monitors' }
const SPARK_SHOW_TITLES: Record<SparkFoldCategory, string> = {
  echo: 'Show "> spark …" command echoes (off by default)',
  response: 'Show spark output like TPS/health replies (off by default)',
  monitor: 'Show periodic tick/GC monitor lines (off by default)',
}

// Scoreboard objectives behind the stats. No datapack needed: when a query
// answers "Unknown scoreboard objective 'mcm.*'", the client creates these
// once and re-asks — self-setup over the same console socket.
const SETUP_RUN = [
  'scoreboard objectives add mcm.playtime minecraft.custom:minecraft.play_time',
  'scoreboard objectives add mcm.deaths deathCount',
]

const headUrl = (name: string) => `https://mc-heads.net/avatar/${encodeURIComponent(name)}/52`

interface Insight {
  name: string
  loading: boolean
  /** Session text: a real duration (storage stamp), "since HH:MM:SS", or "≥ HH:MM:SS". */
  session?: string
  playtime?: number | null
  deaths?: number | null
  spawn?: { x: number; y: number; z: number } | null
}

interface PendingInspect {
  name: string
  timer: number
  /** Session fallback derived from the log buffer, used when storage has no stamp. */
  fallbackSince?: string
  data: {
    playtime?: number | null
    deaths?: number | null
    spawn?: { x: number; y: number; z: number } | null
    sessionEpoch?: number | null
  }
}

function Console() {
  const { running, consoleConnected, logs, appendLog, clearLogs, sendCommand, subscribe } = useServer()
  const { token, logout, username } = useAuth()
  const { toast } = useToast()
  const [command, setCommand] = useState('')
  const [filter, setFilter] = useState('')
  const [selIdx, setSelIdx] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [focused, setFocused] = useState(false)
  const [prefs, setPrefs] = useState<ConsolePrefs>(loadConsolePrefs)
  const [roster, setRoster] = useState<Player[]>([])
  const [insight, setInsight] = useState<Insight | null>(null)
  const [hideDraft, setHideDraft] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const pendingRef = useRef<PendingInspect | null>(null)
  // Self-setup (creating the mcm objectives) runs at most once per page session.
  const setupRanRef = useRef(false)

  // Persist display preferences so every admin keeps the console they prefer.
  useEffect(() => {
    saveConsolePrefs(prefs)
  }, [prefs])

  // Roster for the Inspect picker (refreshed when the server starts).
  useEffect(() => {
    let cancelled = false
    apiFetch<Player[]>('/players', { headers: authHeaders(token) }).then((r) => {
      if (cancelled) return
      if (r.kind === 'ok') setRoster(r.data)
      else if (r.kind === 'unauthorized') logout()
    })
    return () => { cancelled = true }
  }, [token, logout, running])

  // Close the player picker on an outside click or Escape.
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const classified = useMemo(() => logs.map(classifyLine), [logs])

  // A line is "folded" when it's built-in mcm.* query traffic, matches one of
  // the user's hide rules, or is spark noise the user hasn't chosen to reveal.
  // spark's health/gc reports print one prefixed trigger line then a single
  // raw multi-line message with no per-line tag of its own — foldSparkBlocks
  // tracks "are we still inside that message" across the whole log, since no
  // single-line anchor can catch every one of its sub-lines.
  const decorated = useMemo(() => {
    const blockFolded = foldSparkBlocks(classified.map((l) => ({ content: contentOf(l.raw), time: l.time })))
    return classified.map((l, i) => {
      const content = contentOf(l.raw)
      const sparkCat = sparkFoldCategory(content)
      return {
        ...l,
        hidden:
          l.quiet ||
          matchesHideRules(content, prefs.hideRules) ||
          (blockFolded[i] && !prefs.sparkShow.response) ||
          (sparkCat !== null && !prefs.sparkShow[sparkCat]),
      }
    })
  }, [classified, prefs.hideRules, prefs.sparkShow])
  const hiddenCount = useMemo(() => decorated.reduce((n, l) => n + (l.hidden ? 1 : 0), 0), [decorated])

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return decorated.filter((l) =>
      (l.hidden ? prefs.showQuiet : prefs.show[l.type]) &&
      (!q || l.raw.toLowerCase().includes(q)))
  }, [decorated, prefs.showQuiet, prefs.show, filter])

  // Command suggestions — a cheap prefix filter over the static registry.
  const suggest = useMemo(() => getSuggestions(command), [command])
  const showSuggest =
    focused && !dismissed && running && command.trim().length > 0 &&
    (suggest.items.length > 0 || !!suggest.command)
  const sel = Math.min(selIdx, Math.max(0, suggest.items.length - 1))

  // Auto-scroll to the newest line only when the user is already at the bottom.
  useEffect(() => {
    const el = outputRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [rows])

  const handleScroll = () => {
    const el = outputRef.current
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  // ---- Inspect a player: quiet mcm.* queries fill the insight strip --------

  const finishInspect = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    window.clearTimeout(p.timer)
    pendingRef.current = null
    // Session: prefer the storage stamp (a real duration that survives the log
    // buffer and client reloads); fall back to what the buffer could tell us.
    const epoch = p.data.sessionEpoch
    const session = typeof epoch === 'number'
      ? formatPlaytime(Math.max(0, Math.floor((Date.now() - epoch) / 50)))
      : p.fallbackSince
    setInsight((cur) => (cur && cur.name === p.name
      ? {
          ...cur,
          loading: false,
          session,
          playtime: p.data.playtime ?? null,
          deaths: p.data.deaths ?? null,
          spawn: p.data.spawn ?? null,
        }
      : cur))
  }, [])

  // Watch the socket: stamp sessions on join/leave, parse quiet-query replies.
  useEffect(() => {
    const unsub = subscribe((line) => {
      // Session stamps: a join writes the player's epoch to storage so the
      // session survives the log buffer (and client reloads); a leave clears
      // it. Idempotent across tabs — concurrent writes set the same value.
      const ev = classifyLine(line)
      if (ev.type === 'join' && ev.who) {
        sendCommand(`data modify storage mcm:sessions ${ev.who} set value ${Date.now()}L`)
      } else if (ev.type === 'leave' && ev.who) {
        sendCommand(`data remove storage mcm:sessions ${ev.who}`)
      }

      const p = pendingRef.current
      if (!p) return
      const c = contentOf(line)
      const pt = parseScoreLine(c, p.name, 'mcm.playtime')
      if (pt !== null) p.data.playtime = pt
      const d = parseScoreLine(c, p.name, 'mcm.deaths')
      if (d !== null) p.data.deaths = d
      const w = parseWaypointLine(c)
      if (w) p.data.spawn = w
      const se = parseSessionLine(c)
      if (se !== null) p.data.sessionEpoch = se
      if (isUnknownObjective(c)) {
        if (!setupRanRef.current) {
          // Self-setup: create the objectives once, then re-ask shortly after.
          setupRanRef.current = true
          SETUP_RUN.forEach(sendCommand)
          window.setTimeout(() => {
            const q = pendingRef.current
            if (!q) return
            sendCommand(`scoreboard players get ${q.name} mcm.playtime`)
            sendCommand(`scoreboard players get ${q.name} mcm.deaths`)
          }, 700)
        } else {
          // Creation already attempted this session — resolve as unavailable.
          if (c.includes('mcm.playtime')) p.data.playtime = p.data.playtime ?? null
          if (c.includes('mcm.deaths')) p.data.deaths = p.data.deaths ?? null
        }
      }
      const none = noScoreObjective(c)
      if (none === 'mcm.playtime') p.data.playtime = 0
      if (none === 'mcm.deaths') p.data.deaths = 0
      if (new RegExp(`^Found no elements matching ${p.name}$`).test(c)) {
        p.data.sessionEpoch = p.data.sessionEpoch ?? null
      }
      if (/^Found no elements matching spawn$/.test(c)) p.data.spawn = p.data.spawn ?? null
      if (
        p.data.playtime !== undefined && p.data.deaths !== undefined &&
        p.data.spawn !== undefined && p.data.sessionEpoch !== undefined
      ) {
        finishInspect()
      }
    })
    return unsub
  }, [subscribe, sendCommand, finishInspect])

  const inspectPlayer = (name: string) => {
    if (!running) {
      toast('Start the server to inspect players', 'error')
      return
    }
    if (!isValidName(name)) return
    // Buffer-derived session fallback: the last join still in the buffer, or —
    // when the player is online but their join has scrolled out — the oldest
    // line we still have ("online since at least …").
    let fallbackSince: string | undefined
    for (let i = classified.length - 1; i >= 0; i--) {
      const l = classified[i]
      if (l.who !== name) continue
      if (l.type === 'join') { fallbackSince = l.time && `since ${l.time}`; break }
      if (l.type === 'leave') break
    }
    if (!fallbackSince && roster.some((pl) => pl.name === name && pl.online)) {
      const oldest = classified.find((l) => l.time)?.time
      if (oldest) fallbackSince = `≥ ${oldest}`
    }
    if (pendingRef.current) window.clearTimeout(pendingRef.current.timer)
    setInsight({ name, loading: true })
    pendingRef.current = {
      name,
      fallbackSince,
      data: {},
      timer: window.setTimeout(finishInspect, 4000),
    }
    sendCommand(`scoreboard players get ${name} mcm.playtime`)
    sendCommand(`scoreboard players get ${name} mcm.deaths`)
    sendCommand('data get storage mcm:waypoints spawn')
    sendCommand(`data get storage mcm:sessions ${name}`)
  }

  const tpToSpawn = () => {
    if (!insight?.spawn) return
    const cmd = teleportToCoordsCommand(insight.name, insight.spawn.x, insight.spawn.y, insight.spawn.z)
    if (cmd) {
      sendCommand(cmd)
      toast(`Sent ${insight.name} to spawn`, 'success')
    }
  }

  // ---- Command input (unchanged behavior) -----------------------------------

  const changeCommand = (value: string) => {
    setCommand(value)
    setSelIdx(0)
    setDismissed(false)
  }

  const accept = (s: Suggestion) => {
    const before = command.slice(0, suggest.replaceStart)
    const after = command.slice(suggest.replaceEnd)
    changeCommand(`${before}${s.value} ${after}`)
    inputRef.current?.focus()
  }

  // Chat-by-default input: plain text is broadcast to everyone (pretty tellraw
  // + a shared log record), "/" forces a command, and a known command word runs
  // even without a slash. `say` is intercepted so it becomes the broadcast.
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    const raw = command.trim()
    if (!raw) return
    const action = parseConsoleInput(raw, isCommandName)
    if (action.kind === 'command') {
      sendCommand(action.command)
      appendLog(`> ${action.command}`)
    } else if (action.kind === 'broadcast') {
      const b = broadcastCommands(action.message, username)
      if (b) {
        // The pretty message for players, then store-and-read the record so it
        // lands in every console and the log file (tellraw is silent).
        sendCommand(b.say)
        sendCommand(b.logWrite)
        sendCommand(b.logShow)
        toast('Broadcast sent to everyone', 'success')
      }
    }
    historyRef.current = [raw, ...historyRef.current.filter((c) => c !== raw)].slice(0, 100)
    historyIdxRef.current = -1
    setCommand('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = suggest.items
    if (showSuggest && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelIdx((i) => (Math.min(i, items.length - 1) + 1) % items.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelIdx((i) => (Math.min(i, items.length - 1) - 1 + items.length) % items.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        accept(items[sel])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    const h = historyRef.current
    if (e.key === 'ArrowUp') {
      if (!h.length) return
      e.preventDefault()
      const idx = Math.min(historyIdxRef.current + 1, h.length - 1)
      historyIdxRef.current = idx
      changeCommand(h[idx])
    } else if (e.key === 'ArrowDown') {
      if (historyIdxRef.current < 0) return
      e.preventDefault()
      const idx = historyIdxRef.current - 1
      historyIdxRef.current = idx
      changeCommand(idx < 0 ? '' : h[idx])
    }
  }

  const downloadLogs = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mc-console-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const addHideRule = (e: React.FormEvent) => {
    e.preventDefault()
    const r = hideDraft.trim()
    if (!r) return
    setPrefs((p) => (p.hideRules.includes(r) ? p : { ...p, hideRules: [...p.hideRules, r] }))
    setHideDraft('')
  }
  const removeHideRule = (r: string) =>
    setPrefs((p) => ({ ...p, hideRules: p.hideRules.filter((x) => x !== r) }))

  // Raw stays plain, but the log levels earn a colour so noise vs alerts read
  // at a glance; player-facing lines keep the default terminal colour.
  const rawLevelClass = (t: LineType) =>
    t === 'error' ? 'lvl-error' : t === 'warn' ? 'lvl-warn' : t === 'system' ? 'lvl-system' : ''

  const usageParts = suggest.command ? splitUsage(suggest.command.usage) : null

  // ---- Row renderers ---------------------------------------------------------

  const gutter = (l: ConsoleLine) => {
    const meta = TYPE_META[l.type]
    if (l.type === 'chat' && prefs.heads && l.who) {
      return (
        <img
          className="cl-head"
          src={headUrl(l.who)}
          alt=""
          loading="lazy"
          aria-hidden="true"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        />
      )
    }
    if (prefs.icons && meta.icon) {
      return <span className="cl-gutter" style={{ '--c': meta.color } as React.CSSProperties}>{meta.icon}</span>
    }
    return <span className="cl-dot" style={{ '--c': meta.color } as React.CSSProperties} />
  }

  const feedBody = (l: ConsoleLine) => {
    if (l.broadcast) {
      return <><span className="cl-bc-tag">Broadcast</span> <span className="cl-msg">{l.text}</span></>
    }
    switch (l.type) {
      case 'chat':
        return (
          <span className="cl-bubble">
            <span className="cl-nm" style={{ color: nameColor(l.who ?? '') }}>{l.who}</span>{' '}
            <span className="cl-msg">{l.text}</span>
          </span>
        )
      case 'adv':
        return (
          <>
            <b className="cl-who">{l.who}</b> earned{' '}
            <span className="cl-tag">{l.adv}</span>
          </>
        )
      case 'death':
        return <><b className="cl-who">{l.who}</b> <span className="cl-dim">{l.text}</span></>
      case 'join':
        return <><b className="cl-who">{l.who}</b> <span className="cl-dim">joined the game</span></>
      case 'leave':
        return <><b className="cl-who">{l.who}</b> <span className="cl-dim">left the game</span></>
      case 'cmd':
        return <span className="cl-cmd">&gt; {l.text}</span>
      case 'warn':
      case 'error':
        return (
          <>
            <span className={`cl-lvl ${l.type}`}>{l.type === 'warn' ? 'WARN' : 'ERROR'}</span>{' '}
            <span className="cl-dim">{l.text}</span>
          </>
        )
      default:
        return <span className="cl-dim">{l.text}</span>
    }
  }

  const termBody = (l: ConsoleLine) => {
    if (l.broadcast) {
      return <><span className="cl-bc-tag">Broadcast</span> <span className="cl-ink">{l.text}</span></>
    }
    if (l.type === 'chat') {
      return (
        <>
          {'<'}<span className="cl-tname" style={{ color: nameColor(l.who ?? '') }}>{l.who}</span>{'> '}
          <span className="cl-ink">{l.text}</span>
        </>
      )
    }
    if (l.type === 'cmd') return <span className="cl-cmd">&gt; {l.text}</span>
    return <span style={{ color: TYPE_META[l.type].color }}>{contentOf(l.raw)}</span>
  }

  const renderRows = () => {
    if (rows.length === 0) {
      return (
        <div className="terminal-empty">
          {filter || rows.length !== classified.length
            ? 'No lines match the current filters.'
            : 'No console output yet.'}
        </div>
      )
    }
    if (prefs.view === 'raw') {
      return rows.map((l, i) => (
        <div key={i} className={`log-line ${rawLevelClass(l.type)} ${l.hidden ? 'log-hidden' : ''}`}>{l.raw}</div>
      ))
    }
    if (prefs.view === 'term') {
      return rows.map((l, i) => (
        <div key={i} className={`cl-row term ${l.hidden ? 'quiet' : ''}`}>
          <span className="cl-ts">{l.time ?? ''}</span>
          <span className="cl-dot" style={{ '--c': TYPE_META[l.type].color } as React.CSSProperties} />
          <span className="cl-body">
            {termBody(l)}
            {l.hidden && <span className="cl-qbadge">HIDDEN</span>}
          </span>
        </div>
      ))
    }
    return rows.map((l, i) => (
      <div key={i} className={`cl-row ${l.hidden ? 'quiet' : ''}`}>
        <span className="cl-ts">{l.time ?? ''}</span>
        {gutter(l)}
        <span className="cl-body">
          {feedBody(l)}
          {l.hidden && <span className="cl-qbadge">HIDDEN</span>}
        </span>
      </div>
    ))
  }

  const insightOnline = insight ? roster.some((p) => p.name === insight.name && p.online) : false

  return (
    <main className="terminal">
      <div className="terminal-toolbar">
        <div className="terminal-search">
          <Search size={14} className="terminal-search-icon" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs…"
            aria-label="Filter logs"
          />
        </div>
        <span className="terminal-count">
          {rows.length === logs.length ? logs.length : `${rows.length} / ${logs.length}`} lines
        </span>
        {running && (
          <span
            className={`term-conn ${consoleConnected ? 'is-live' : 'is-down'}`}
            title={consoleConnected ? 'Console connected' : 'Reconnecting to the console…'}
          >
            <span className="term-conn-dot" />
            {consoleConnected ? 'Live' : 'Reconnecting…'}
          </span>
        )}
        <button type="button" className="terminal-tool" onClick={downloadLogs} disabled={!logs.length} title="Download logs" aria-label="Download logs">
          <Download size={15} />
        </button>
        <button type="button" className="terminal-tool" onClick={clearLogs} disabled={!logs.length} title="Clear console" aria-label="Clear console">
          <Trash2 size={15} />
        </button>
      </div>

      <div className="cl-controls">
        <div className="cl-seg" role="group" aria-label="Console view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={prefs.view === v.id ? 'on' : ''}
              aria-pressed={prefs.view === v.id}
              onClick={() => setPrefs((p) => ({ ...p, view: v.id }))}
            >
              {v.label}
            </button>
          ))}
        </div>
        {prefs.view === 'feed' && (
          <>
            <label className="cl-tog">
              <input
                type="checkbox"
                checked={prefs.heads}
                onChange={(e) => { const heads = e.target.checked; setPrefs((p) => ({ ...p, heads })) }}
              />
              <span className="cl-track" />
              Player heads
            </label>
            <label className="cl-tog">
              <input
                type="checkbox"
                checked={prefs.icons}
                onChange={(e) => { const icons = e.target.checked; setPrefs((p) => ({ ...p, icons })) }}
              />
              <span className="cl-track" />
              Type icons
            </label>
          </>
        )}
        <div className="cl-pick-wrap" ref={pickerRef}>
          <button
            type="button"
            className="cl-pick"
            disabled={!running || roster.length === 0}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
            title={running ? 'Read a player’s stats via quiet queries' : 'Start the server to inspect players'}
          >
            Inspect player…
            <ChevronDown size={14} className="cl-pick-caret" />
          </button>
          {pickerOpen && (
            <div className="cl-pick-menu" role="listbox" aria-label="Inspect a player">
              {roster.map((p) => (
                <button
                  key={p.uuid}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="cl-pick-opt"
                  onClick={() => { inspectPlayer(p.name); setPickerOpen(false) }}
                >
                  <span className={`cl-pick-dot ${p.online ? 'is-online' : ''}`} />
                  <span className="cl-pick-name">{p.name}</span>
                  {p.online && <span className="cl-pick-on">online</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="cl-chips" aria-label="Event filters">
        {CHIP_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            className="cl-chip"
            aria-pressed={prefs.show[t]}
            style={{ '--c': TYPE_META[t].color } as React.CSSProperties}
            onClick={() => setPrefs((p) => ({ ...p, show: { ...p.show, [t]: !p.show[t] } }))}
          >
            <span className="cl-cd" />
            {TYPE_META[t].label}
          </button>
        ))}
        <button
          type="button"
          className="cl-chip cl-chip-quiet"
          aria-pressed={prefs.showQuiet}
          onClick={() => setPrefs((p) => ({ ...p, showQuiet: !p.showQuiet }))}
          title="Folded lines — the panel's stat queries plus your hide rules. Toggle to reveal them."
        >
          <span className="cl-cd" />
          Hidden · {hiddenCount}
        </button>
      </div>

      <div className="cl-hide">
        <span className="cl-hide-label"><EyeOff size={13} /> Hide</span>
        {prefs.hideRules.map((r) => (
          <button
            key={r}
            type="button"
            className="cl-rule"
            onClick={() => removeHideRule(r)}
            title="Remove this hide rule"
          >
            <span className="cl-rule-text">{r}</span>
            <X size={11} />
          </button>
        ))}
        <form className="cl-hide-add" onSubmit={addHideRule}>
          <input
            value={hideDraft}
            onChange={(e) => setHideDraft(e.target.value)}
            placeholder={prefs.hideRules.length ? 'add another…' : 'hide lines matching…  (text, or /regex/)'}
            aria-label="Add a hide rule"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="cl-rule-add" disabled={!hideDraft.trim()}>Hide</button>
        </form>
      </div>

      <div className="cl-spark" aria-label="spark console noise">
        <span className="cl-spark-label"><Zap size={13} /> spark</span>
        {(['echo', 'response', 'monitor'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className="cl-chip cl-chip-spark"
            aria-pressed={prefs.sparkShow[k]}
            title={SPARK_SHOW_TITLES[k]}
            onClick={() => setPrefs((p) => ({ ...p, sparkShow: { ...p.sparkShow, [k]: !p.sparkShow[k] } }))}
          >
            <span className="cl-cd" />
            {SPARK_SHOW_LABELS[k]}
          </button>
        ))}
        <span className="cl-spark-hint">off by default · toggle on to see this traffic here</span>
      </div>

      {insight && (
        <div className="cl-insight" aria-live="polite">
          <img
            className="cl-ins-head"
            src={headUrl(insight.name)}
            alt=""
            aria-hidden="true"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
          <span className="cl-ins-name">{insight.name}</span>
          <span className="cl-ins-stat">
            <b>{insight.loading ? '…' : insight.playtime != null ? formatPlaytime(insight.playtime) : '—'}</b>
            <span>Playtime</span>
          </span>
          <span className="cl-ins-stat">
            <b>{insight.loading ? '…' : insight.deaths != null ? insight.deaths : '—'}</b>
            <span>Deaths</span>
          </span>
          <span className="cl-ins-stat">
            <b>{insight.loading ? '…' : insight.session ?? '—'}</b>
            <span>Session</span>
          </span>
          <span
            className="cl-ins-stat"
            title={!insight.loading && !insight.spawn
              ? 'Set it once from this console: data modify storage mcm:waypoints spawn set value {x: 0, y: 64, z: 0}'
              : undefined}
          >
            <b>{insight.loading ? '…' : insight.spawn ? `${insight.spawn.x} ${insight.spawn.y} ${insight.spawn.z}` : '—'}</b>
            <span>Spawn waypoint</span>
          </span>
          {!insight.loading && insight.spawn && (
            <button type="button" className="cl-mini" onClick={tpToSpawn} disabled={!insightOnline} title={insightOnline ? 'Teleport them to the spawn waypoint' : `${insight.name} is offline`}>
              <MapPin size={13} />
              To spawn
            </button>
          )}
          <button type="button" className="cl-ins-close" onClick={() => setInsight(null)} aria-label="Close player insights">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="terminal-output" ref={outputRef} onScroll={handleScroll}>
        {renderRows()}
      </div>

      <form className="terminal-input" onSubmit={handleSend}>
        {showSuggest && (
          <div className="cmd-suggest" role="listbox" aria-label="Command suggestions">
            {usageParts && (
              <div className="cmd-preview">
                <span className="cmd-usage">
                  <span className="cmd-usage-name">{usageParts.name}</span>
                  {usageParts.rest && <span className="cmd-usage-args"> {usageParts.rest}</span>}
                </span>
                <span className="cmd-desc">{suggest.command?.desc}</span>
              </div>
            )}
            {suggest.items.map((s, i) => (
              <button
                type="button"
                key={s.value}
                role="option"
                aria-selected={i === sel}
                className={`cmd-item ${i === sel ? 'sel' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  accept(s)
                }}
              >
                <span className="cmd-item-value">{s.value}</span>
                {s.hint && <span className="cmd-item-hint">{s.hint}</span>}
              </button>
            ))}
          </div>
        )}
        <span className="prompt">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => changeCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={running ? 'Message everyone, or /command…  (Tab to complete, ↑/↓ history)' : 'Server is not running'}
          disabled={!running}
        />
      </form>
    </main>
  )
}

// Split "gamemode <mode> [target]" into name + the rest, for styled preview.
function splitUsage(usage: string): { name: string; rest: string } {
  const i = usage.indexOf(' ')
  return i === -1 ? { name: usage, rest: '' } : { name: usage.slice(0, i), rest: usage.slice(i + 1) }
}

export default Console
