// Maps player-management actions to the Minecraft server console commands that
// perform them. The commands are sent over the same console WebSocket the
// terminal uses, so no extra API surface is required.

// Java-edition usernames are up to 16 chars of [A-Za-z0-9_]. Validating here
// keeps a name read from the API from ever turning into a multi-token command.
const VALID_NAME = /^\w{1,16}$/

export function isValidName(name: string): boolean {
  return VALID_NAME.test(name)
}

// Collapse newlines/returns so a single free-text field can never smuggle a
// second console command onto its own line.
function sanitizeText(input: string): string {
  return input.replace(/[\r\n]+/g, ' ').trim()
}

export function opCommand(name: string, op: boolean): string | null {
  if (!VALID_NAME.test(name)) return null
  return op ? `op ${name}` : `deop ${name}`
}

export function whitelistCommand(name: string, add: boolean): string | null {
  if (!VALID_NAME.test(name)) return null
  return add ? `whitelist add ${name}` : `whitelist remove ${name}`
}

export function teleportToPlayerCommand(player: string, target: string): string | null {
  if (!VALID_NAME.test(player) || !VALID_NAME.test(target)) return null
  return `tp ${player} ${target}`
}

export function teleportToCoordsCommand(player: string, x: number, y: number, z: number): string | null {
  if (!VALID_NAME.test(player)) return null
  if (![x, y, z].every((n) => Number.isFinite(n))) return null
  return `tp ${player} ${x} ${y} ${z}`
}

export function kickCommand(player: string, reason?: string): string | null {
  if (!VALID_NAME.test(player)) return null
  const r = reason ? sanitizeText(reason) : ''
  return r ? `kick ${player} ${r}` : `kick ${player}`
}

export function banCommand(player: string, reason?: string): string | null {
  if (!VALID_NAME.test(player)) return null
  const r = reason ? sanitizeText(reason) : ''
  return r ? `ban ${player} ${r}` : `ban ${player}`
}

export function ipBanCommand(player: string, reason?: string): string | null {
  if (!VALID_NAME.test(player)) return null
  const r = reason ? sanitizeText(reason) : ''
  return r ? `ban-ip ${player} ${r}` : `ban-ip ${player}`
}

export function pardonCommand(player: string): string | null {
  if (!VALID_NAME.test(player)) return null
  return `pardon ${player}`
}

export function runAsCommand(player: string, command: string): string | null {
  if (!VALID_NAME.test(player)) return null
  // Drop a leading slash so both "say hi" and "/say hi" work.
  const cmd = sanitizeText(command).replace(/^\/+/, '')
  if (!cmd) return null
  return `execute as ${player} at ${player} run ${cmd}`
}

export const TELLRAW_COLORS = ['white', 'yellow', 'gold', 'green', 'aqua', 'red', 'light_purple', 'gray'] as const
export type TellrawColor = (typeof TELLRAW_COLORS)[number]

// The admin's chat identity. There are no roles on the site yet, so the role is
// a fixed "[Admin]" tag; the name is the signed-in user (read from the JWT) when
// we know it. Rendered as tellraw components — reused by DMs and broadcasts.
function adminLabelParts(sender?: string | null): Record<string, unknown>[] {
  const name = sender ? sanitizeText(sender) : ''
  const parts: Record<string, unknown>[] = [
    { text: '[', color: 'gray' },
    { text: 'Admin', color: 'aqua', bold: true },
    { text: ']', color: 'gray' },
  ]
  if (name) parts.push({ text: ` ${name}`, color: 'gold', bold: true })
  return parts
}

// Plain-text form of the same label, for the console log record.
function adminLabelText(sender?: string | null): string {
  const name = sender ? sanitizeText(sender) : ''
  return name ? `[Admin] ${name}` : '[Admin]'
}

export function directMessageCommand(
  player: string,
  message: string,
  color: TellrawColor = 'white',
  sender?: string | null,
): string | null {
  if (!VALID_NAME.test(player)) return null
  const msg = sanitizeText(message)
  if (!msg) return null
  // A private whisper only <player> sees: "[Admin] Name → you: msg". The
  // "[Admin]" tag is a role fallback until the site has real roles; the name is
  // the signed-in admin. JSON.stringify escapes the message content safely.
  const component = [
    '',
    ...adminLabelParts(sender),
    { text: ' → you: ', color: 'gray' },
    { text: msg, color, italic: true },
  ]
  return `tellraw ${player} ${JSON.stringify(component)}`
}

// Storage the broadcast record is round-tripped through. A non-"mcm:" namespace
// so the console's quiet rules don't fold the record away — only the write echo
// is folded (see consoleLines.ts: parseBroadcastRecord / QUIET_RULES).
const BROADCAST_STORAGE = 'broadcast:log'

// An SNBT string literal: wrap in quotes and escape the two special characters.
function snbt(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export interface Broadcast {
  /** tellraw @a … — the pretty message every player sees in chat. */
  say: string
  /** data modify … — stores the record; its "Modified storage" echo is folded. */
  logWrite: string
  /** data get … — its echo carries the record to *every* console and the log
   *  file, since tellraw itself returns nothing (so it would otherwise vanish). */
  logShow: string
  /** Plain "[Admin] Name: msg" — the recorded text. */
  record: string
}

/**
 * Turn a free-text broadcast into the console commands that send it: a pretty
 * `tellraw @a` for the players, plus a store-then-read pair whose echo records
 * the send in the shared console and log file. `sender` is the signed-in admin.
 */
export function broadcastCommands(message: string, sender?: string | null): Broadcast | null {
  const msg = sanitizeText(message)
  if (!msg) return null
  const record = `${adminLabelText(sender)}: ${msg}`
  const component = [
    '',
    ...adminLabelParts(sender),
    { text: ': ', color: 'gray' },
    { text: msg, color: 'white' },
  ]
  return {
    say: `tellraw @a ${JSON.stringify(component)}`,
    logWrite: `data modify storage ${BROADCAST_STORAGE} msg set value ${snbt(record)}`,
    logShow: `data get storage ${BROADCAST_STORAGE}`,
    record,
  }
}
