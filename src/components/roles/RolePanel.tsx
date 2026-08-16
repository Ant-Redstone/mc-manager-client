import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, ShieldCheck, ShieldOff, Loader2, Crown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePermissions } from '../../context/PermissionsContext'
import { useToast } from '../toast/ToastContext'
import { getAvatarColor } from '../../lib/avatar'
import {
  fetchPermissionSchema,
  fetchRoles,
  fetchUserPermissions,
  setUserRole,
  setUserOverrides,
  OWNER_ROLE,
  type PermissionZone,
  type RoleInfo,
  type Permission,
} from '../../lib/permissions'
import { failureMessage } from '../../lib/api'
import type { User } from '../../types/user'
import './RolePanel.css'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface RolePanelProps {
  user: User
  onClose: () => void
  onSaved: () => void
}

function defaultsOf(role: RoleInfo | undefined): Record<Permission, boolean> {
  const map: Record<Permission, boolean> = {}
  role?.permissions.forEach((p) => (map[p] = true))
  return map
}

function RolePanel({ user, onClose, onSaved }: RolePanelProps) {
  const { token, username: myUsername } = useAuth()
  const { refresh: refreshMyPermissions } = usePermissions()
  const { toast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)

  const [closing, setClosing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [schema, setSchema] = useState<PermissionZone[] | null>(null)
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [originalRole, setOriginalRole] = useState<string>('')
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [working, setWorking] = useState<Record<Permission, boolean>>({})
  const [saving, setSaving] = useState(false)

  const isOwnerTarget = originalRole === OWNER_ROLE
  const isSelf = user.username === myUsername

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchPermissionSchema(token),
      fetchRoles(token),
      fetchUserPermissions(token, user.id),
    ]).then(([schemaRes, rolesRes, userRes]) => {
      if (cancelled) return
      if (schemaRes.kind === 'ok') setSchema(schemaRes.data)
      if (rolesRes.kind === 'ok') setRoles(rolesRes.data)
      if (userRes.kind === 'ok') {
        setOriginalRole(userRes.data.role)
        setSelectedRole(userRes.data.role)
        setWorking(userRes.data.permissions)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [token, user.id])

  const selectedRoleInfo = useMemo(() => roles.find((r) => r.name === selectedRole), [roles, selectedRole])
  const assignableRoles = useMemo(() => roles.filter((r) => r.name !== OWNER_ROLE), [roles])

  const roleDefaults = useMemo(() => defaultsOf(selectedRoleInfo), [selectedRoleInfo])
  const dirty =
    selectedRole !== originalRole ||
    Object.keys(roleDefaults).some((k) => !!working[k] !== !!roleDefaults[k]) ||
    Object.keys(working).some((k) => !!working[k] !== !!roleDefaults[k])

  const changeRole = (name: string) => {
    setSelectedRole(name)
    const info = roles.find((r) => r.name === name)
    setWorking(defaultsOf(info))
  }

  const toggle = (key: Permission) => {
    setWorking((w) => ({ ...w, [key]: !w[key] }))
  }

  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setClosing(true)
    window.setTimeout(onClose, 220)
  }, [onClose])

  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  }, [requestClose])

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
  }, [])

  const save = async () => {
    setSaving(true)
    if (selectedRole !== originalRole) {
      const r = await setUserRole(token, user.id, selectedRole)
      if (r.kind !== 'ok') {
        toast(failureMessage(r, 'Failed to change role'), 'error')
        setSaving(false)
        return
      }
    }
    const overrides: Record<Permission, boolean> = {}
    for (const key of Object.keys(roleDefaults)) {
      if (!!working[key] !== !!roleDefaults[key]) overrides[key] = !!working[key]
    }
    for (const key of Object.keys(working)) {
      if (!(key in roleDefaults) && working[key]) overrides[key] = true
    }
    const r2 = await setUserOverrides(token, user.id, overrides)
    setSaving(false)
    if (r2.kind !== 'ok') {
      toast(failureMessage(r2, 'Failed to save permission overrides'), 'error')
      return
    }
    toast(`${user.username} is now ${selectedRole}`, 'success')
    if (isSelf) refreshMyPermissions()
    onSaved()
    requestClose()
  }

  return (
    <div className={`rp-root ${closing ? 'closing' : ''}`}>
      <div className="rp-scrim" onClick={requestClose} />
      <aside className="rp-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={`Manage ${user.username}'s access`}>
        <header className="rp-header">
          <span className="rp-avatar" style={{ background: getAvatarColor(user.username) }}>
            {user.username.charAt(0).toUpperCase()}
          </span>
          <div className="rp-headtext">
            <div className="rp-name">{user.username}</div>
            <div className="rp-sub">Joined {new Date(user.created_at).toLocaleDateString()}</div>
          </div>
          <button className="rp-close" onClick={requestClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="rp-body">
          {loading ? (
            <p className="rp-hint">Loading…</p>
          ) : isOwnerTarget ? (
            <div className="rp-owner-banner">
              <Crown size={18} />
              This is the Owner account. Its access can't be changed here — see the server's seed file.
            </div>
          ) : (
            <>
              <section className="rp-section">
                <h3 className="rp-section-title">Role</h3>
                <select
                  className="rp-select"
                  value={selectedRole}
                  onChange={(e) => changeRole(e.target.value)}
                  disabled={saving}
                >
                  {!selectedRole && <option value="">No role assigned</option>}
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {isSelf && (
                  <p className="rp-hint rp-warn">
                    You're editing your own access — you can't remove your own role-management permission.
                  </p>
                )}
              </section>

              {schema?.map((zone) => (
                <section className="rp-section" key={zone.key}>
                  <h3 className="rp-section-title">{zone.label}</h3>
                  {zone.permissions.map((p) => {
                    const on = !!working[p.key]
                    const isCustom = on !== !!roleDefaults[p.key]
                    return (
                      <div className="rp-toggle-row" key={p.key} title={p.description}>
                        <div className="rp-toggle-label">
                          {on ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
                          {p.label}
                          {isCustom && <span className="rp-custom-tag">custom</span>}
                        </div>
                        <button
                          className={`rp-toggle ${on ? 'is-on' : ''}`}
                          disabled={saving || !selectedRole}
                          aria-pressed={on}
                          onClick={() => toggle(p.key)}
                        >
                          {on ? 'On' : 'Off'}
                        </button>
                      </div>
                    )
                  })}
                </section>
              ))}
            </>
          )}
        </div>

        {!isOwnerTarget && !loading && (
          <footer className="rp-footer">
            {dirty && <span className="rp-unsaved">Unsaved changes</span>}
            <button className="rp-btn rp-btn-ghost" onClick={requestClose} disabled={saving}>
              Cancel
            </button>
            <button className="rp-btn rp-btn-primary" onClick={save} disabled={saving || !dirty || !selectedRole}>
              {saving ? <Loader2 size={15} className="rp-spin" /> : null}
              Save
            </button>
          </footer>
        )}
      </aside>
    </div>
  )
}

export default RolePanel
