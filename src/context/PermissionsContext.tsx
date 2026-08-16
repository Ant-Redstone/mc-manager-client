import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { fetchMyPermissions, type Permission } from '../lib/permissions'

interface PermissionsContextType {
  /** True once this server build is confirmed to have the permissions feature at all. */
  supported: boolean
  loading: boolean
  role: string | null
  /**
   * Whether the current user may do `perm`. Answers `true` for everything
   * while the server doesn't support permissions yet (an old deploy, where
   * nothing is gated server-side either — see PermissionsContext's loader),
   * so this never hides functionality the API would still allow.
   */
  can: (perm: Permission) => boolean
  refresh: () => void
}

const PermissionsContext = createContext<PermissionsContextType | null>(null)

export function PermissionsProvider({ children }: { children: ReactNode }) {
  // Only ever mounted inside ProtectedRoute (see App.tsx), so isAuthenticated
  // is already guaranteed true for this component's whole lifetime -- it
  // unmounts on logout rather than re-rendering with the flag flipped.
  const { token } = useAuth()
  const [supported, setSupported] = useState(true)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Record<Permission, boolean> | null>(null)
  const [epoch, setEpoch] = useState(0)

  const refresh = useCallback(() => setEpoch((e) => e + 1), [])

  useEffect(() => {
    let cancelled = false
    // loading starts true (see useState above) and only ever goes false, once,
    // below -- a refresh() re-fetches silently rather than flashing it again.
    fetchMyPermissions(token).then((r) => {
      if (cancelled) return
      if (r.kind === 'ok') {
        setSupported(true)
        setRole(r.data.role || null)
        setPermissions(r.data.permissions)
      } else if (r.kind === 'unsupported') {
        setSupported(false)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [token, epoch])

  const can = useCallback(
    (perm: Permission) => {
      if (!supported) return true
      if (!permissions) return false
      return !!permissions[perm]
    },
    [supported, permissions],
  )

  return (
    <PermissionsContext.Provider value={{ supported, loading, role, can, refresh }}>
      {children}
    </PermissionsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider')
  return ctx
}
