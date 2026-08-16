// Registry fetchers for PLAN-multi-server.md's multi-server picker (D3/D5).
// Imports `./api.ts` WITH the extension, unlike the rest of src/ -- this
// file is the one lib module a test imports directly (tests/servers.test.ts),
// and that runs under plain `node --test`, not Vite, so the specifier has to
// resolve without bundler help. Every other consumer (ServersContext,
// Servers.tsx, ServerContext.tsx, ...) is compiled by tsc/Vite and can keep
// using the usual extensionless import.
import { apiFetch, authHeaders, type ApiResult } from './api.ts'

/**
 * A row from the servers registry (PLAN-multi-server.md D1/D3). Field names
 * mirror the backend's `servers` table and its `types.Server` JSON tags
 * column for column.
 */
export interface ServerInfo {
  id: string
  name: string
  dir: string
  port: number
  voice_port: number | null
  jar: string
  xms: string
  xmx: string
  sort: number
  created_at: string
}

/**
 * Live process status for one server. Mirrors today's flat `/status`
 * response ({running}) -- the richer state the supervisor tracks internally
 * (pid, start time, heartbeat -- see types.ServerRuntimeStatus backend-side)
 * isn't serialized to the API yet, so this only claims what the client can
 * actually know.
 */
export interface ServerStatus {
  running: boolean
}

/**
 * Returns the namespaced path when we know the server, else the flat legacy
 * path — which is what keeps this working against a backend that predates
 * the registry.
 */
export function serverPath(serverId: string | null, suffix: string): string {
  const normalized = suffix.startsWith('/') ? suffix : `/${suffix}`
  return serverId ? `/servers/${encodeURIComponent(serverId)}${normalized}` : normalized
}

export function fetchServers(token: string | null): Promise<ApiResult<ServerInfo[]>> {
  return apiFetch<ServerInfo[]>('/servers', { headers: authHeaders(token) })
}

export function fetchServerStatus(token: string | null, serverId: string): Promise<ApiResult<ServerStatus>> {
  return apiFetch<ServerStatus>(serverPath(serverId, '/status'), { headers: authHeaders(token) })
}

export function startServer(token: string | null, serverId: string): Promise<ApiResult<null>> {
  return apiFetch<null>(serverPath(serverId, '/start'), { method: 'POST', headers: authHeaders(token) })
}

export function stopServer(token: string | null, serverId: string): Promise<ApiResult<null>> {
  return apiFetch<null>(serverPath(serverId, '/stop'), { method: 'POST', headers: authHeaders(token) })
}

/**
 * Parse a JVM -Xms/-Xmx spec ("1G", "512M") into MB. Returns null for
 * anything that doesn't match the registry's own format (db/migrations.sql
 * defaults xms/xmx to '1G'/'2G', and the create-server flow is expected to
 * keep writing the same shape).
 */
export function parseMemSpecMb(spec: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*([kmg])$/i.exec(spec.trim())
  if (!m) return null
  const n = parseFloat(m[1])
  switch (m[2].toLowerCase()) {
    case 'g': return n * 1024
    case 'm': return n
    case 'k': return n / 1024
    default: return null
  }
}
