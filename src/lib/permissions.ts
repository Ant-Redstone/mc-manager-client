import { apiFetch, authHeaders, type ApiResult } from './api'

/** Opaque permission key, e.g. "server.start" — defined once on the backend. */
export type Permission = string

export interface PermissionInfo {
  key: Permission
  label: string
  description: string
}

export interface PermissionZone {
  key: string
  label: string
  permissions: PermissionInfo[]
}

export interface RoleInfo {
  id: number
  name: string
  permissions: Permission[]
  is_system: boolean
}

export interface MyPermissions {
  role: string
  permissions: Record<Permission, boolean>
}

export interface UserPermissions extends MyPermissions {
  user_id: number
  username: string
}

/** The one role that can never be assigned or edited through this UI. */
export const OWNER_ROLE = 'Owner'

export function fetchPermissionSchema(token: string | null): Promise<ApiResult<PermissionZone[]>> {
  return apiFetch<PermissionZone[]>('/permissions/schema', { headers: authHeaders(token) })
}

export function fetchMyPermissions(token: string | null): Promise<ApiResult<MyPermissions>> {
  return apiFetch<MyPermissions>('/me/permissions', { headers: authHeaders(token) })
}

export function fetchRoles(token: string | null): Promise<ApiResult<RoleInfo[]>> {
  return apiFetch<RoleInfo[]>('/roles', { headers: authHeaders(token) })
}

export function fetchUserPermissions(token: string | null, userId: number): Promise<ApiResult<UserPermissions>> {
  return apiFetch<UserPermissions>(`/users/${userId}/permissions`, { headers: authHeaders(token) })
}

export function setUserRole(token: string | null, userId: number, role: string): Promise<ApiResult<null>> {
  return apiFetch<null>(`/users/${userId}/role`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ role }),
  })
}

export function setUserOverrides(
  token: string | null,
  userId: number,
  overrides: Record<Permission, boolean>,
): Promise<ApiResult<null>> {
  return apiFetch<null>(`/users/${userId}/overrides`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ overrides }),
  })
}
