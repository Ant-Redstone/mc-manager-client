import { useEffect, useState } from 'react'
import { Gamepad2, Link2, Unlink, ShieldCheck, ShieldOff, Loader2, Crown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePermissions } from '../../context/PermissionsContext'
import { useToast } from '../../components/toast/ToastContext'
import { getAvatarColor } from '../../lib/avatar'
import { apiFetch, authHeaders, failureMessage } from '../../lib/api'
import { fetchPermissionSchema, OWNER_ROLE, type PermissionZone } from '../../lib/permissions'
import { fetchMcLink, startMcLink, verifyMcLink, unlinkMc, type McLink } from '../../lib/mclink'
import type { User } from '../../types/user'
import './Account.css'

type LinkStage = 'loading' | 'unlinked' | 'code-sent' | 'linked'

function Account() {
  const { token, username } = useAuth()
  const { supported, loading: permsLoading, role, can } = usePermissions()
  const { toast } = useToast()

  const [me, setMe] = useState<User | null>(null)
  // Tracked separately from `me` so a request that finished but returned
  // nothing (an older backend has no /api/me) reads as "unavailable" rather
  // than sitting on "Loading…" forever.
  const [meResolved, setMeResolved] = useState(false)
  const [schema, setSchema] = useState<PermissionZone[] | null>(null)

  const [linkStage, setLinkStage] = useState<LinkStage>('loading')
  const [link, setLink] = useState<McLink | null>(null)
  const [mcUsername, setMcUsername] = useState('')
  const [code, setCode] = useState('')
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<User>('/me', { headers: authHeaders(token) }).then((r) => {
      if (r.kind === 'ok') setMe(r.data)
      setMeResolved(true)
    })
    fetchPermissionSchema(token).then((r) => {
      if (r.kind === 'ok') setSchema(r.data)
    })
    fetchMcLink(token).then((r) => {
      if (r.kind === 'ok' && r.data) {
        setLink(r.data)
        setLinkStage('linked')
      } else {
        setLinkStage('unlinked')
      }
    })
  }, [token])

  const sendCode = async () => {
    const name = mcUsername.trim()
    if (!name) return
    setLinkBusy(true)
    setLinkError(null)
    const r = await startMcLink(token, name)
    if (r.kind === 'ok') {
      setCodeExpiresAt(r.data.expires_at)
      setLinkStage('code-sent')
    } else {
      setLinkError(failureMessage(r, 'Could not reach the server'))
    }
    setLinkBusy(false)
  }

  const confirmCode = async () => {
    const value = code.trim()
    if (!value) return
    setLinkBusy(true)
    setLinkError(null)
    const r = await verifyMcLink(token, value)
    if (r.kind === 'ok') {
      setLink(r.data)
      setLinkStage('linked')
      setCode('')
      toast('Minecraft account linked', 'success')
    } else {
      setLinkError(failureMessage(r, 'Could not reach the server'))
    }
    setLinkBusy(false)
  }

  const doUnlink = async () => {
    setLinkBusy(true)
    const r = await unlinkMc(token)
    if (r.kind === 'ok') {
      setLink(null)
      setLinkStage('unlinked')
      setMcUsername('')
      toast('Minecraft account unlinked', 'success')
    } else {
      toast(failureMessage(r, 'Could not reach the server'), 'error')
    }
    setLinkBusy(false)
  }

  const isOwner = role === OWNER_ROLE

  return (
    <div className="account-page">
      <h2>My Account</h2>

      <section className="acct-identity">
        <span className="acct-avatar" style={{ background: getAvatarColor(username ?? '?') }}>
          {(username ?? '?').charAt(0).toUpperCase()}
        </span>
        <div className="acct-identity-text">
          <span className="acct-name">{username}</span>
          <span className="acct-sub">
            {me
              ? `Member since ${new Date(me.created_at).toLocaleDateString()}`
              : meResolved
                ? 'Signed in'
                : 'Loading…'}
            {role && <span className={`acct-role-badge ${isOwner ? 'is-owner' : ''}`}>{role}</span>}
          </span>
        </div>
      </section>

      <section className="acct-card">
        <h3 className="acct-card-title">
          <Gamepad2 size={16} /> Minecraft account
        </h3>

        {linkStage === 'loading' && <p className="acct-hint">Loading…</p>}

        {linkStage === 'linked' && link && (
          <div className="acct-linked">
            <img
              className="acct-mc-head"
              src={`https://mc-heads.net/avatar/${link.mc_uuid || link.mc_username}/48`}
              alt=""
              aria-hidden="true"
            />
            <div className="acct-linked-text">
              <span className="acct-mc-name">{link.mc_username}</span>
              <span className="acct-sub">Linked {new Date(link.linked_at).toLocaleDateString()}</span>
            </div>
            <button className="acct-btn acct-btn-ghost" onClick={doUnlink} disabled={linkBusy}>
              <Unlink size={15} /> Unlink
            </button>
          </div>
        )}

        {linkStage === 'unlinked' && (
          <>
            <p className="acct-help">
              Link your Minecraft account to prove it's yours. You'll need to be online to receive the code.
            </p>
            <div className="acct-inline-form">
              <input
                className="acct-input"
                placeholder="Your Minecraft username"
                value={mcUsername}
                disabled={linkBusy}
                maxLength={16}
                onChange={(e) => setMcUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
              />
              <button className="acct-btn acct-btn-primary" onClick={sendCode} disabled={linkBusy || !mcUsername.trim()}>
                {linkBusy ? <Loader2 size={15} className="acct-spin" /> : <Link2 size={15} />}
                Send code
              </button>
            </div>
            {linkError && <p className="acct-error">{linkError}</p>}
          </>
        )}

        {linkStage === 'code-sent' && (
          <>
            <p className="acct-help">
              Check your in-game chat for a private message with a 6-character code
              {codeExpiresAt && <> — it expires at {new Date(codeExpiresAt).toLocaleTimeString()}</>}.
            </p>
            <div className="acct-inline-form">
              <input
                className="acct-input acct-code-input"
                placeholder="CODE"
                value={code}
                disabled={linkBusy}
                maxLength={6}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && confirmCode()}
              />
              <button className="acct-btn acct-btn-primary" onClick={confirmCode} disabled={linkBusy || !code.trim()}>
                {linkBusy ? <Loader2 size={15} className="acct-spin" /> : <ShieldCheck size={15} />}
                Confirm
              </button>
              <button
                className="acct-btn acct-btn-ghost"
                disabled={linkBusy}
                onClick={() => {
                  setLinkStage('unlinked')
                  setCode('')
                  setLinkError(null)
                }}
              >
                Cancel
              </button>
            </div>
            {linkError && <p className="acct-error">{linkError}</p>}
          </>
        )}
      </section>

      <section className="acct-card">
        <h3 className="acct-card-title">
          <ShieldCheck size={16} /> My permissions
        </h3>

        {!supported ? (
          <p className="acct-hint">This server build doesn't support permissions yet.</p>
        ) : permsLoading || !schema ? (
          <p className="acct-hint">Loading…</p>
        ) : isOwner ? (
          <div className="acct-owner-banner">
            <Crown size={18} />
            You have full access to everything — you're the Owner.
          </div>
        ) : !role ? (
          <p className="acct-hint">
            No role assigned yet. Ask an admin to grant you access on the Users page.
          </p>
        ) : (
          <div className="acct-perm-zones">
            {schema.map((zone) => (
              <div className="acct-perm-zone" key={zone.key}>
                <h4 className="acct-perm-zone-title">{zone.label}</h4>
                <ul className="acct-perm-list">
                  {zone.permissions.map((p) => (
                    <li
                      key={p.key}
                      className={`acct-perm-row ${can(p.key) ? 'is-granted' : ''}`}
                      title={p.description}
                    >
                      {can(p.key) ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                      {p.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Account
