import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usePermissions } from '../../context/PermissionsContext'
import { Copy, Check, Plus, X, ShieldCheck } from 'lucide-react'
import { apiFetch, authHeaders, failureMessage } from '../../lib/api'
import { getAvatarColor } from '../../lib/avatar'
import RolePanel from '../../components/roles/RolePanel'
import type { User, Invitation } from '../../types/user'
import './Users.css'

function Users() {
  const { token, logout } = useAuth()
  const { can, supported: permissionsSupported } = usePermissions()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [managing, setManaging] = useState<User | null>(null)

  // Two separate questions, and both have to be yes. `can()` answers "is this
  // account allowed to", but it deliberately answers true for everything when
  // the backend has no permissions system at all — that fallback exists so we
  // never hide something the API would still accept. Here that fallback is
  // wrong on its own: without the backend there is no /api/roles or
  // /api/permissions/schema either, so offering "Access" would open a panel
  // with an empty role dropdown and no permission list. Gate on `supported`
  // too, and the affordance simply isn't there until it can work.
  const canManageRoles = permissionsSupported && can('admin.manage_roles')
  const headers = authHeaders(token)

  useEffect(() => {
    let cancelled = false

    apiFetch<User[]>('/users', { headers })
      .then((r) => {
        if (cancelled) return
        if (r.kind === 'ok') setUsers(r.data)
        else if (r.kind === 'unauthorized') logout()
        else if (r.kind === 'network') setError('Could not connect to server')
        // other kinds: leave the list empty (matches the prior silent path)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [token])

  const createInvitation = async () => {
    setCreating(true)
    setError(null)
    const r = await apiFetch<Invitation>('/admin/invitations', { method: 'POST', headers })
    if (r.kind === 'ok') setInviteLink(r.data.link)
    else if (r.kind === 'unauthorized') logout()
    else if (r.kind === 'network') setError('Could not connect to server')
    else setError(failureMessage(r, 'Failed to create invitation'))
    setCreating(false)
  }

  const copyToClipboard = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const dismissInvite = () => {
    setInviteLink(null)
    setCopied(false)
  }

  return (
    <div className="users-page">
      <div className="users-header">
        <h2>Users</h2>
        <button className="btn-invite" onClick={createInvitation} disabled={creating}>
          <Plus size={16} />
          {creating ? 'Creating...' : 'Invite User'}
        </button>
      </div>

      {error && <p className="users-error">{error}</p>}

      {inviteLink && (
        <div className="modal-overlay" onClick={dismissInvite}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invitation Created</h3>
              <button className="btn-dismiss" onClick={dismissInvite} title="Close">
                <X size={16} />
              </button>
            </div>
            <p className="modal-description">Share this link with the user you want to invite:</p>
            <div className="invite-link-row">
              <code className="invite-link">{inviteLink}</code>
              <button className="btn-copy" onClick={copyToClipboard} title="Copy link">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <span className="invite-note">Expires in 24 hours</span>
          </div>
        </div>
      )}

      {loading && <p className="users-loading">Loading users...</p>}

      {!loading && users.length === 0 && (
        <p className="users-empty">No users registered yet.</p>
      )}

      {!loading && users.length > 0 && (
        <div className="users-list">
          {users.map((user) => (
            <div
              key={user.id}
              className={`user-card ${canManageRoles ? 'is-clickable' : ''}`}
              onClick={() => canManageRoles && setManaging(user)}
              role={canManageRoles ? 'button' : undefined}
              tabIndex={canManageRoles ? 0 : undefined}
              onKeyDown={(e) => {
                if (canManageRoles && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setManaging(user)
                }
              }}
            >
              <div className="user-avatar-placeholder" style={{ background: getAvatarColor(user.username) }}>
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">{user.username}</span>
                <span className="user-joined">Joined {new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              {canManageRoles && (
                <span className="user-manage-hint">
                  <ShieldCheck size={14} /> Access
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {managing && (
        <RolePanel user={managing} onClose={() => setManaging(null)} onSaved={() => {}} />
      )}
    </div>
  )
}

export default Users
