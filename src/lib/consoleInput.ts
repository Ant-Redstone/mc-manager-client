// Decide what the console input box does with a line. Modelled on in-game chat:
// plain text is broadcast to everyone; a leading "/" forces a command (so
// modded or unlisted commands still run); and a recognised command word typed
// without a slash still runs, for server-console muscle memory. `say` — with or
// without a slash — is intercepted so it becomes the prettier broadcast instead
// of vanilla say. Pure; the caller turns each action into actual commands.

export type ConsoleAction =
  | { kind: 'empty' }
  | { kind: 'command'; command: string }
  | { kind: 'broadcast'; message: string }

export function parseConsoleInput(
  raw: string,
  isCommandName: (token: string) => boolean,
): ConsoleAction {
  const input = raw.trim()
  if (!input) return { kind: 'empty' }

  const slash = input.startsWith('/')
  const body = (slash ? input.slice(1) : input).trim()
  if (!body) return { kind: 'empty' }

  const first = body.split(/\s+/, 1)[0]

  // `say` becomes the pretty broadcast, replacing vanilla say — slash or not.
  if (first.toLowerCase() === 'say') {
    const message = body.slice(first.length).trim()
    return message ? { kind: 'broadcast', message } : { kind: 'empty' }
  }

  // A leading slash forces command execution (including modded/unknown commands).
  if (slash) return { kind: 'command', command: body }

  // No slash: a recognised command still runs; anything else is chat.
  if (isCommandName(first.toLowerCase())) return { kind: 'command', command: body }
  return { kind: 'broadcast', message: body }
}
