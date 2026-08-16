import { apiFetch, authHeaders, type ApiResult } from './api'

export interface McLink {
  mc_username: string
  mc_uuid: string
  linked_at: string
}

export interface McLinkStarted {
  mc_username: string
  expires_at: string
}

export function fetchMcLink(token: string | null): Promise<ApiResult<McLink | null>> {
  return apiFetch<McLink | null>('/me/mclink', { headers: authHeaders(token) })
}

export function startMcLink(token: string | null, mcUsername: string): Promise<ApiResult<McLinkStarted>> {
  return apiFetch<McLinkStarted>('/me/mclink/start', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ mc_username: mcUsername }),
  })
}

export function verifyMcLink(token: string | null, code: string): Promise<ApiResult<McLink>> {
  return apiFetch<McLink>('/me/mclink/verify', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ code }),
  })
}

export function unlinkMc(token: string | null): Promise<ApiResult<null>> {
  return apiFetch<null>('/me/mclink', { method: 'DELETE', headers: authHeaders(token) })
}
