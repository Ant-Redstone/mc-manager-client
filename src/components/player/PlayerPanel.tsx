import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Shield, ShieldOff, ListChecks, MapPin, Home, Send, Terminal,
  Ban, UserX, Undo2, Map as MapIcon, Clock, Skull, LogIn,
} from 'lucide-react'
import { useServer } from '../../context/ServerContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../toast/ToastContext'
import type { Player } from '../../types/player'
import {
  opCommand, whitelistCommand, teleportToPlayerCommand, teleportToCoordsCommand,
  kickCommand, banCommand, ipBanCommand, pardonCommand, runAsCommand,
  directMessageCommand, TELLRAW_COLORS, type TellrawColor,
} from '../../lib/playerCommands'
import { formatPlaytime, formatSessionLength } from '../../lib/playtime'
import { useBlueMapUrl } from '../../lib/settings'
import { parsePlayerChat } from '../../lib/chat'
import './PlayerPanel.css'

// One entry in the panel's live conversation: a message the player sent
// (parsed from the console) or a DM the admin sent this session.
interface ChatEntry {
  key: string
  from: 'them' | 'me'
  text: string
  time?: string
  sort: number
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface PlayerPanelProps {
  player: Player
  onlinePlayers: Player[]
  worldSpawn?: { x: number; y: number; z: number }
  onClose: () => void
  onRefresh: () => void
}

type ConfirmKind = 'kick' | 'ban' | 'ipban' | null

function PlayerPanel({ player, onlinePlayers, worldSpawn, onClose, onRefresh }: PlayerPanelProps) {
  const { running, sendCommand, chatLog } = useServer()
  const { username } = useAuth()
  const { toast } = useToast()
  const bluemapUrl = useBlueMapUrl()
  const panelRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  // Whether the chat is pinned to its newest message (true while the user is
  // at the bottom); gates whether an incoming message auto-scrolls.
  const stickRef = useRef(true)

  const [closing, setClosing] = useState(false)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState<ConfirmKind>(null)
  const [tpTarget, setTpTarget] = useState('')
  const [coords, setCoords] = useState({ x: '', y: '', z: '' })
  const [message, setMessage] = useState('')
  const [msgColor, setMsgColor] = useState<TellrawColor>('white')
  const [runCmd, setRunCmd] = useState('')
  // A ticking clock so the current-session duration stays live. Kept out of
  // render (calling Date.now() during render is impure).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // DMs sent from this panel session, tracked locally (tellraw is private, so
  // it isn't echoed to the console) so the conversation reads two-way.
  const [sentDms, setSentDms] = useState<{ seq: number; text: string; at: number }[]>([])

  // Live conversation: the player's chat parsed from the console log (updates
  // as new lines stream in over the WebSocket) interleaved with our DMs.
  const conversation = useMemo<ChatEntry[]>(() => {
    const them = parsePlayerChat(chatLog, player.name).map<ChatEntry>((m) => ({
      key: `t${m.id}`, from: 'them', text: m.text, time: m.time, sort: m.id,
    }))
    const me = sentDms.map<ChatEntry>((d) => ({
      key: `m${d.seq}`, from: 'me', text: d.text, sort: d.at + 0.5,
    }))
    return [...them, ...me].sort((a, b) => a.sort - b.sort)
  }, [chatLog, player.name, sentDms])

  // Keep the chat pinned to the newest message, but only while the user is
  // already at the bottom — scrolling up to read history stays put.
  useEffect(() => {
    const el = chatRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [conversation])

  const onChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const online = player.online
  const canAct = running // console WebSocket is only live while the server runs

  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setClosing(true)
    window.setTimeout(onClose, 220)
  }, [onClose])

  // Keep the latest requestClose reachable from the mount-only key handler
  // below, so that listener attaches once and never misses an Esc during a
  // re-render's effect teardown.
  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  }, [requestClose])

  // Dispatch a console command with a success toast, then refresh the roster.
  const dispatch = useCallback(
    (cmd: string | null, okMsg: string) => {
      if (!canAct) {
        toast('Start the server to manage players', 'error')
        return
      }
      if (!cmd) {
        toast('That input is not valid', 'error')
        return
      }
      sendCommand(cmd)
      toast(okMsg, 'success')
      window.setTimeout(onRefresh, 800)
    },
    [canAct, sendCommand, toast, onRefresh],
  )

  // Focus trap: focus into the panel on open, trap Tab, Esc closes, restore
  // focus to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
        : []

    focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        requestCloseRef.current()
        return
      }
      if (e.key === 'Tab') {
        const els = focusables()
        if (els.length === 0) return
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
    // Mount-only: attach the trap once; Esc routes through requestCloseRef.
  }, [])

  // --- action handlers ------------------------------------------------------
  const moderationReason = reason.trim() || undefined
  const doKick = () => dispatch(kickCommand(player.name, moderationReason), `Kicked ${player.name}`)
  const doBan = () => dispatch(banCommand(player.name, moderationReason), `Banned ${player.name}`)
  const doIpBan = () => dispatch(ipBanCommand(player.name, moderationReason), `IP-banned ${player.name}`)
  const runConfirmed = (kind: Exclude<ConfirmKind, null>) => {
    if (kind === 'kick') doKick()
    else if (kind === 'ban') doBan()
    else doIpBan()
    setConfirm(null)
    setReason('')
  }

  const sessionText = player.online_since ? formatSessionLength(player.online_since, now) : null

  const hasInsights =
    player.total_playtime_ticks !== undefined ||
    player.deaths !== undefined ||
    sessionText !== null

  const tpTargets = onlinePlayers.filter((p) => p.name !== player.name)

  const sendDm = () => {
    const text = message.trim()
    if (!text) return
    dispatch(directMessageCommand(player.name, message, msgColor, username), `Message sent to ${player.name}`)
    // Sort just after the newest chat message present when we send, so our DM
    // lands in order and later incoming messages fall below it.
    const lastSeq = chatLog.length ? chatLog[chatLog.length - 1].seq : -1
    setSentDms((s) => [...s, { seq: s.length, text, at: lastSeq }])
    setMessage('')
  }

  return (
    <div className={`pp-root ${closing ? 'closing' : ''}`}>
      <div className="pp-scrim" onClick={requestClose} />
      <aside
        className="pp-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Manage ${player.name}`}
      >
        {/* Header */}
        <header className="pp-header">
          <img
            className="pp-avatar"
            src={`https://mc-heads.net/avatar/${player.uuid}/72`}
            alt=""
            aria-hidden="true"
          />
          <div className="pp-headtext">
            <div className="pp-name">{player.name}</div>
            <div className={`pp-presence ${online ? 'is-online' : ''}`}>
              <span className="pp-presence-dot" />
              {online ? 'Online' : 'Offline'}
            </div>
          </div>
          <button className="pp-close" onClick={requestClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {(player.is_op || player.is_whitelisted || player.is_banned) && (
          <div className="pp-tags">
            {player.is_op && <span className="pp-tag pp-tag-op">Operator</span>}
            {player.is_whitelisted && <span className="pp-tag pp-tag-wl">Whitelisted</span>}
            {player.is_banned && <span className="pp-tag pp-tag-ban">Banned</span>}
          </div>
        )}

        {!canAct && (
          <p className="pp-notice">The server is stopped — start it to manage players.</p>
        )}

        <div className="pp-body">
          {/* Insights */}
          {(hasInsights || bluemapUrl) && (
            <section className="pp-section">
              {hasInsights && (
              <div className="pp-stats">
                {player.total_playtime_ticks !== undefined && (
                  <div className="pp-stat">
                    <Clock size={15} className="pp-stat-icon" />
                    <span className="pp-stat-value">{formatPlaytime(player.total_playtime_ticks)}</span>
                    <span className="pp-stat-label">Playtime</span>
                  </div>
                )}
                {player.deaths !== undefined && (
                  <div className="pp-stat">
                    <Skull size={15} className="pp-stat-icon" />
                    <span className="pp-stat-value">{player.deaths}</span>
                    <span className="pp-stat-label">Deaths</span>
                  </div>
                )}
                {sessionText && (
                  <div className="pp-stat">
                    <LogIn size={15} className="pp-stat-icon" />
                    <span className="pp-stat-value">{sessionText}</span>
                    <span className="pp-stat-label">This session</span>
                  </div>
                )}
              </div>
              )}
              {bluemapUrl && (
                <a className="pp-maplink" href={bluemapUrl} target="_blank" rel="noreferrer">
                  <MapIcon size={15} />
                  View on live map
                </a>
              )}
            </section>
          )}

          {/* Role */}
          <section className="pp-section">
            <h3 className="pp-section-title">Role</h3>
            <div className="pp-toggle-row">
              <div className="pp-toggle-label">
                <Shield size={16} />
                Operator
              </div>
              <button
                className={`pp-toggle ${player.is_op ? 'is-on' : ''}`}
                disabled={!canAct}
                aria-pressed={player.is_op}
                onClick={() =>
                  dispatch(
                    opCommand(player.name, !player.is_op),
                    player.is_op ? `De-opped ${player.name}` : `Opped ${player.name}`,
                  )
                }
              >
                {player.is_op ? <ShieldOff size={14} /> : <Shield size={14} />}
                {player.is_op ? 'Revoke op' : 'Make op'}
              </button>
            </div>
            <div className="pp-toggle-row">
              <div className="pp-toggle-label">
                <ListChecks size={16} />
                Whitelist
              </div>
              <button
                className={`pp-toggle ${player.is_whitelisted ? 'is-on' : ''}`}
                disabled={!canAct}
                aria-pressed={player.is_whitelisted}
                onClick={() =>
                  dispatch(
                    whitelistCommand(player.name, !player.is_whitelisted),
                    player.is_whitelisted
                      ? `Removed ${player.name} from whitelist`
                      : `Whitelisted ${player.name}`,
                  )
                }
              >
                {player.is_whitelisted ? 'Remove' : 'Add'}
              </button>
            </div>
          </section>

          {/* Teleport */}
          <section className="pp-section">
            <h3 className="pp-section-title">Teleport</h3>
            {!online && <p className="pp-hint">{player.name} is offline.</p>}
            <div className="pp-btn-grid">
              {worldSpawn && (
                <button
                  className="pp-btn"
                  disabled={!canAct || !online}
                  onClick={() =>
                    dispatch(
                      teleportToCoordsCommand(player.name, worldSpawn.x, worldSpawn.y, worldSpawn.z),
                      `Sent ${player.name} to spawn`,
                    )
                  }
                >
                  <Home size={15} />
                  To spawn
                </button>
              )}
            </div>
            {tpTargets.length > 0 && (
              <div className="pp-inline-form">
                <select
                  className="pp-select"
                  value={tpTarget}
                  disabled={!canAct || !online}
                  onChange={(e) => setTpTarget(e.target.value)}
                  aria-label="Teleport target"
                >
                  <option value="">Teleport to player…</option>
                  {tpTargets.map((p) => (
                    <option key={p.uuid} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="pp-btn"
                  disabled={!canAct || !online || !tpTarget}
                  onClick={() => {
                    dispatch(
                      teleportToPlayerCommand(player.name, tpTarget),
                      `Teleported ${player.name} to ${tpTarget}`,
                    )
                    setTpTarget('')
                  }}
                >
                  <MapPin size={15} />
                  Go
                </button>
              </div>
            )}
            <div className="pp-inline-form">
              <div className="pp-coords">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <input
                    key={axis}
                    className="pp-input pp-coord"
                    type="number"
                    inputMode="numeric"
                    placeholder={axis.toUpperCase()}
                    aria-label={`${axis.toUpperCase()} coordinate`}
                    value={coords[axis]}
                    disabled={!canAct || !online}
                    onChange={(e) => setCoords((c) => ({ ...c, [axis]: e.target.value }))}
                  />
                ))}
              </div>
              <button
                className="pp-btn"
                disabled={!canAct || !online || coords.x === '' || coords.y === '' || coords.z === ''}
                onClick={() => {
                  dispatch(
                    teleportToCoordsCommand(player.name, Number(coords.x), Number(coords.y), Number(coords.z)),
                    `Teleported ${player.name}`,
                  )
                  setCoords({ x: '', y: '', z: '' })
                }}
              >
                <MapPin size={15} />
                Go
              </button>
            </div>
          </section>

          {/* Chat */}
          <section className="pp-section">
            <h3 className="pp-section-title">Chat</h3>
            {conversation.length > 0 ? (
              <div className="pp-chat" ref={chatRef} onScroll={onChatScroll}>
                {conversation.map((m) => (
                  <div key={m.key} className={`pp-bubble pp-bubble-${m.from}`}>
                    <span className="pp-bubble-text">{m.text}</span>
                    {m.time && <span className="pp-bubble-time">{m.time}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="pp-chat-empty">
                No recent chat from {player.name}. Their messages appear here live as they talk.
              </p>
            )}
            {!online && <p className="pp-hint">{player.name} is offline — you can still read past messages.</p>}
            <textarea
              className="pp-input pp-textarea"
              placeholder={`Message ${player.name} privately…`}
              rows={2}
              value={message}
              disabled={!canAct || !online}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && canAct && online && message.trim()) {
                  e.preventDefault()
                  sendDm()
                }
              }}
            />
            <div className="pp-inline-form">
              <select
                className="pp-select"
                value={msgColor}
                disabled={!canAct || !online}
                onChange={(e) => setMsgColor(e.target.value as TellrawColor)}
                aria-label="Message color"
              >
                {TELLRAW_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <button
                className="pp-btn pp-btn-primary"
                disabled={!canAct || !online || !message.trim()}
                onClick={sendDm}
              >
                <Send size={15} />
                Send
              </button>
            </div>
          </section>

          {/* Advanced */}
          <section className="pp-section">
            <h3 className="pp-section-title">Run as player</h3>
            {!online && <p className="pp-hint">{player.name} is offline.</p>}
            <div className="pp-inline-form">
              <input
                className="pp-input"
                placeholder="e.g. gamemode creative"
                value={runCmd}
                disabled={!canAct || !online}
                onChange={(e) => setRunCmd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && runCmd.trim()) {
                    dispatch(runAsCommand(player.name, runCmd), `Ran command as ${player.name}`)
                    setRunCmd('')
                  }
                }}
              />
              <button
                className="pp-btn"
                disabled={!canAct || !online || !runCmd.trim()}
                onClick={() => {
                  dispatch(runAsCommand(player.name, runCmd), `Ran command as ${player.name}`)
                  setRunCmd('')
                }}
              >
                <Terminal size={15} />
                Run
              </button>
            </div>
          </section>

          {/* Moderation */}
          <section className="pp-section pp-danger">
            <h3 className="pp-section-title">Moderation</h3>

            {player.is_banned ? (
              <button
                className="pp-btn pp-btn-safe"
                disabled={!canAct}
                onClick={() => dispatch(pardonCommand(player.name), `Unbanned ${player.name}`)}
              >
                <Undo2 size={15} />
                Lift ban
              </button>
            ) : (
              <>
                <input
                  className="pp-input"
                  placeholder="Reason (optional)"
                  value={reason}
                  disabled={!canAct}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="pp-btn-grid">
                  <DangerButton
                    icon={<UserX size={15} />}
                    label="Kick"
                    active={confirm === 'kick'}
                    disabled={!canAct || !online}
                    onArm={() => setConfirm('kick')}
                    onConfirm={() => runConfirmed('kick')}
                    onCancel={() => setConfirm(null)}
                  />
                  <DangerButton
                    icon={<Ban size={15} />}
                    label="Ban"
                    active={confirm === 'ban'}
                    disabled={!canAct}
                    onArm={() => setConfirm('ban')}
                    onConfirm={() => runConfirmed('ban')}
                    onCancel={() => setConfirm(null)}
                  />
                  <DangerButton
                    icon={<Ban size={15} />}
                    label="IP-ban"
                    active={confirm === 'ipban'}
                    disabled={!canAct}
                    onArm={() => setConfirm('ipban')}
                    onConfirm={() => runConfirmed('ipban')}
                    onCancel={() => setConfirm(null)}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

interface DangerButtonProps {
  icon: React.ReactNode
  label: string
  active: boolean
  disabled: boolean
  onArm: () => void
  onConfirm: () => void
  onCancel: () => void
}

// Two-step destructive control: a click arms it, a second confirms. Prevents
// a single mis-click from kicking or banning.
function DangerButton({ icon, label, active, disabled, onArm, onConfirm, onCancel }: DangerButtonProps) {
  if (active) {
    return (
      <div className="pp-confirm">
        <button className="pp-btn pp-btn-danger" disabled={disabled} onClick={onConfirm}>
          Confirm {label.toLowerCase()}
        </button>
        <button className="pp-btn pp-btn-ghost" onClick={onCancel} aria-label="Cancel">
          <X size={15} />
        </button>
      </div>
    )
  }
  return (
    <button className="pp-btn pp-btn-danger-ghost" disabled={disabled} onClick={onArm}>
      {icon}
      {label}
    </button>
  )
}

export default PlayerPanel
