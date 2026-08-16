// Parse player chat out of raw console lines, entirely client-side, so the
// player panel can show a live conversation with no new backend endpoint —
// the console log already streams over the /api/console WebSocket. Vanilla
// logs a player's chat as e.g. "[12:34:56] [Server thread/INFO]: <Notch> hi".

export interface ChatMessage {
  /** Stable key: the source line's sequence number. */
  id: number
  /** "HH:MM:SS" when the line carried a timestamp. */
  time?: string
  text: string
}

// A console line kept in the dedicated chat buffer, tagged with a monotonic
// sequence number so a message keeps a stable identity (React key, sort
// order) even after older lines roll out of the buffer.
export interface ChatLine {
  seq: number
  line: string
}

// The sender is in angle brackets; the message is the rest of the line. The
// name pattern matches Java usernames and won't match the app's own "> cmd"
// echoes, join/leave lines, `/say` ([Server] …) or `/me` (* name …) output.
const CHAT_LINE = /<([A-Za-z0-9_]{1,16})>\s+(.+)$/
const TIMESTAMP = /\[(\d{1,2}:\d{2}:\d{2})/

/** True when a raw console line is a player chat message worth keeping. */
export function isChatLine(line: string): boolean {
  return CHAT_LINE.test(line)
}

/**
 * Every chat message `playerName` sent, oldest first — the full history held
 * in the chat buffer, uncapped (the buffer itself bounds retention).
 */
export function parsePlayerChat(chat: ChatLine[], playerName: string): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const { seq, line } of chat) {
    const m = CHAT_LINE.exec(line)
    if (m && m[1] === playerName) {
      out.push({ id: seq, time: TIMESTAMP.exec(line)?.[1], text: m[2] })
    }
  }
  return out
}
