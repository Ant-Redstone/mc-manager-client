// Classify raw console lines into typed events so the console can render them
// as more than plain text (chat with avatars, advancements, deaths, joins…),
// and tag the "quiet" machine traffic — the mcm.* scoreboard/storage queries
// the client sends to read player stats and waypoints — so it can be hidden
// from view by default. Entirely client-side; every rule is a plain regex.

export type LineType =
  | 'chat' | 'join' | 'leave' | 'adv' | 'death'
  | 'warn' | 'error' | 'cmd' | 'system'

export interface ConsoleLine {
  raw: string
  type: LineType
  /** "HH:MM:SS" when the line carried a timestamp. */
  time?: string
  /** Player the event is about (chat/join/leave/adv/death). */
  who?: string
  /** Main text: chat message, death message, command body, or log content. */
  text?: string
  /** Advancement / challenge / goal title. */
  adv?: string
  /** The recorded text of a broadcast the console sent (rendered specially). */
  broadcast?: boolean
  /** Matched a quiet rule — machine query traffic, hidden by default. */
  quiet: boolean
}

const TIME = /\[(\d{1,2}:\d{2}:\d{2})/
const AFTER_PREFIX = /\]:\s(.*)$/
const CHAT = /^<([A-Za-z0-9_]{1,16})>\s(.+)$/
const JOIN = /^([A-Za-z0-9_]{1,16}) joined the game$/
const LEAVE = /^([A-Za-z0-9_]{1,16}) left the game$/
const ADV = /^([A-Za-z0-9_]{1,16}) has (?:made the advancement|completed the challenge|reached the goal) \[(.+)\]$/
const NAME_FIRST = /^([A-Za-z0-9_]{1,16}) (.+)$/
// Vanilla death-message verbs (the common set; unmatched ones fall to system).
const DEATH =
  /^(?:was (?:slain|shot|killed|blown up|pricked|squashed|skewered|impaled|struck by lightning|fireballed|stung|poked|doomed|frozen)|drowned|blew up|burned to death|went up in flames|walked into fire|fell from a high place|fell off|fell out of the world|hit the ground too hard|starved to death|suffocated in a wall|tried to swim in lava|discovered the floor was lava|froze to death|withered away|experienced kinetic energy|left the confines of this world|didn't want to live)/

/** The message part of a log line (after "…]: "), or the line itself. */
export function contentOf(raw: string): string {
  const m = AFTER_PREFIX.exec(raw)
  return m ? m[1] : raw
}

/**
 * Quiet rules: any match folds the line away (revealable via the Quiet chip).
 * They target the mcm.* namespace only, so ordinary commands never fold.
 */
export const QUIET_RULES: readonly RegExp[] = [
  // Echoes of mcm.* queries typed or injected into the console input.
  /^> (?:scoreboard (?:players (?:get|set|add|remove|reset|operation)|objectives (?:add|remove))\b.*\bmcm\.|data (?:get|modify|merge|remove) storage mcm:)/,
  // Scoreboard responses: "Notch has 5410800 [mcm.playtime]".
  /\bhas -?\d+ \[mcm\./,
  // "Set [mcm.playtime] for Notch to 0" (objective writes).
  /^Set \[mcm\./,
  // Auto-setup responses when the client creates the objectives itself.
  /^(?:Created new|Removed) objective \[mcm\./,
  // Objective missing / no score yet.
  /^Unknown scoreboard objective 'mcm\./,
  /^Can't get value of mcm\.\S+ for /,
  // Storage reads/writes: "Storage mcm:waypoints has the following contents: …".
  /^Storage mcm:\S+ has the following contents:/,
  /^(?:Modified|Merged|Removed).*storage mcm:/,
  // The write half of a broadcast record — the read half stays visible.
  /^(?:Modified|Merged|Removed).*storage broadcast:/,
]

export function isQuietContent(content: string): boolean {
  return QUIET_RULES.some((r) => r.test(content))
}

/** Classify one raw console line. Pure — safe to run per render. */
export function classifyLine(raw: string): ConsoleLine {
  const time = TIME.exec(raw)?.[1]
  const content = contentOf(raw)
  const quiet = isQuietContent(content)

  if (content.startsWith('> ')) return { raw, type: 'cmd', time, text: content.slice(2), quiet }

  const bc = parseBroadcastRecord(content)
  if (bc !== null) return { raw, type: 'system', time, text: bc, broadcast: true, quiet }

  let m = CHAT.exec(content)
  if (m) return { raw, type: 'chat', time, who: m[1], text: m[2], quiet }

  if (/\/ERROR\]|\/FATAL\]/.test(raw)) return { raw, type: 'error', time, text: content, quiet }
  if (/\/WARN\]/.test(raw)) return { raw, type: 'warn', time, text: content, quiet }

  m = JOIN.exec(content)
  if (m) return { raw, type: 'join', time, who: m[1], quiet }
  m = LEAVE.exec(content)
  if (m) return { raw, type: 'leave', time, who: m[1], quiet }
  m = ADV.exec(content)
  if (m) return { raw, type: 'adv', time, who: m[1], adv: m[2], quiet }

  m = NAME_FIRST.exec(content)
  if (m && DEATH.test(m[2])) return { raw, type: 'death', time, who: m[1], text: m[2], quiet }

  return { raw, type: 'system', time, text: content, quiet }
}

// ---- Parsers for the quiet-query responses the insight strip reads ---------

const VALID_NAME = /^\w{1,16}$/

/** Value from "Name has N [objective]", or null when the line isn't that. */
export function parseScoreLine(content: string, player: string, objective: string): number | null {
  if (!VALID_NAME.test(player)) return null
  const re = new RegExp(`^${player} has (-?\\d+) \\[${objective.replace(/\./g, '\\.')}\\]$`)
  const m = re.exec(content)
  return m ? Number(m[1]) : null
}

/** Coords from "Storage mcm:waypoints has the following contents: {x:…}". */
export function parseWaypointLine(content: string): { x: number; y: number; z: number } | null {
  if (!/^Storage mcm:\S+ has the following contents:/.test(content)) return null
  const grab = (k: string) => {
    const m = new RegExp(`\\b${k}:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(content)
    return m ? Math.round(Number(m[1])) : null
  }
  const x = grab('x'), y = grab('y'), z = grab('z')
  return x !== null && y !== null && z !== null ? { x, y, z } : null
}

export function isUnknownObjective(content: string): boolean {
  return /^Unknown scoreboard objective 'mcm\./.test(content)
}

/**
 * Does a line match any user hide rule? A rule is a plain (case-insensitive)
 * substring, or a `/regex/flags` form for power users. Invalid regex falls
 * back to a literal match so a bad pattern never throws mid-render.
 */
export function matchesHideRules(content: string, rules: readonly string[]): boolean {
  const lower = content.toLowerCase()
  for (const raw of rules) {
    const rule = raw.trim()
    if (!rule) continue
    const slash = /^\/(.+)\/([a-z]*)$/i.exec(rule)
    if (slash) {
      try {
        if (new RegExp(slash[1], slash[2]).test(content)) return true
        continue
      } catch {
        // Malformed regex — treat the whole thing as literal text instead.
      }
    }
    if (lower.includes(rule.toLowerCase())) return true
  }
  return false
}

/**
 * Epoch millis from "Storage mcm:sessions has the following contents: 1720…L"
 * — the per-player join stamp the client writes when it sees a join line.
 */
export function parseSessionLine(content: string): number | null {
  const m = /^Storage mcm:sessions has the following contents: (-?\d+)L?$/.exec(content)
  return m ? Number(m[1]) : null
}

/** "Can't get value of mcm.playtime for Notch; none is set" → that objective. */
export function noScoreObjective(content: string): string | null {
  const m = /^Can't get value of (mcm\.\S+) for /.exec(content)
  return m ? m[1] : null
}

/**
 * The recorded text of a broadcast the console sent. The client stores the
 * "[Admin] Name: msg" line in `broadcast:log` storage and reads it straight
 * back, so the `data get` echo carries it to every console (and the log file) —
 * tellraw itself is silent. Returns that text, or null when it isn't a record.
 */
export function parseBroadcastRecord(content: string): string | null {
  const m = /^Storage broadcast:log has the following contents: \{.*?\bmsg:\s*"((?:[^"\\]|\\.)*)"/.exec(content)
  return m ? m[1].replace(/\\(.)/g, '$1') : null
}

// ---- Stable per-player accent colour (for chat names/avatars) --------------

export const NAME_PALETTE = ['#4ecca3', '#6ea8e6', '#b98cf0', '#5fc47f', '#e8b64c', '#e88cbf'] as const

export function nameColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return NAME_PALETTE[h % NAME_PALETTE.length]
}
