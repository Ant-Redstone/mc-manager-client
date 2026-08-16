// Optional chaining on `.env` (not just the var) matters: Vite always
// populates import.meta.env, but tests/servers.test.ts pulls this module in
// through plain `node --test` (no Vite involved), where import.meta.env is
// undefined — a bare `.VITE_API_BASE` access would throw before the `??`
// fallback ever ran.
export const API_BASE = import.meta.env?.VITE_API_BASE ?? 'http://localhost:8080/api'

/** Auth + common headers for API requests. */
export function authHeaders(token: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'ngrok-skip-browser-warning': 'true',
  }
}

/** Outcome of an API call, classified so callers can react precisely. */
export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unsupported' }            // 404: this server build lacks the endpoint
  | { kind: 'unauthorized' }           // 401: token missing/expired
  | { kind: 'forbidden'; message: string } // 403: signed in, but this account may not
  | { kind: 'error'; message: string } // reachable but failed (4xx/5xx or success:false)
  | { kind: 'network' }                // fetch threw: the server is truly unreachable

interface Envelope<T> { success: boolean; data?: T; error?: string }

/**
 * The message to show the user for a failed call.
 *
 * Exists so that adding a new failure kind can't silently downgrade a screen.
 * Call sites used to spell this out as `r.kind === 'error' ? r.message :
 * fallback`, which meant the day 403 stopped being folded into `error`, every
 * one of them would have quietly started showing a generic "Failed to …"
 * instead of the server's actual "you don't have permission to do that". One
 * place to get right, and the same reasoning applies to whatever kind comes
 * next.
 */
export function failureMessage(result: ApiResult<unknown>, fallback: string): string {
  return result.kind === 'error' || result.kind === 'forbidden' ? result.message : fallback
}

/**
 * Fetch an API endpoint and classify the outcome. Checks `res.status` BEFORE
 * parsing: Gin answers unregistered routes with a text/plain 404, so calling
 * `res.json()` on it throws and would be misread as a network failure — which
 * is exactly how the Files/Backups pages showed "Could not reach the server"
 * against server builds that don't ship those endpoints.
 */
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch {
    return { kind: 'network' }
  }
  if (res.status === 404) return { kind: 'unsupported' }
  if (res.status === 401) return { kind: 'unauthorized' }
  // 403 gets its own kind rather than folding into `error` or, worse, being
  // indistinguishable from `unsupported`. "You don't have permission" and "this
  // build doesn't have the feature" look identical from a caller that only
  // checks `kind !== 'ok'`, and that ambiguity has already cost real debugging
  // time: when the permissions system shipped, the Discord bot's own service
  // account lost its role and the bot reported "servidor indisponível" —
  // pointing at the Minecraft server, which was healthy the entire time.
  if (res.status === 403) {
    let message = 'You do not have permission to do that'
    try {
      const body = (await res.json()) as Envelope<T>
      if (body.error) message = body.error
    } catch {
      // a proxy's HTML 403 — keep the default wording
    }
    return { kind: 'forbidden', message }
  }
  try {
    const body = (await res.json()) as Envelope<T>
    if (body.success) return { kind: 'ok', data: body.data as T }
    return { kind: 'error', message: body.error ?? `Request failed (${res.status})` }
  } catch {
    return { kind: 'error', message: `Unexpected response (${res.status})` }
  }
}
