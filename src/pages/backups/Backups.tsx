import { useCallback, useEffect, useState } from 'react'
import { Archive, Plus, RotateCcw, Trash2, Save, Clock, Download } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useServer } from '../../context/ServerContext'
import { useToast } from '../../components/toast/ToastContext'
import { API_BASE, authHeaders, apiFetch } from '../../lib/api'
import { formatBytes, formatWhen } from '../../lib/format'
import './Backups.css'

interface BackupInfo {
  name: string
  size: number
  created: string
}

interface BackupConfig {
  enabled: boolean
  interval_minutes: number
  keep: number
}

const INTERVALS = [
  { m: 60, label: 'Every hour' },
  { m: 180, label: 'Every 3 hours' },
  { m: 360, label: 'Every 6 hours' },
  { m: 720, label: 'Every 12 hours' },
  { m: 1440, label: 'Every day' },
]

function Backups() {
  const { token, logout } = useAuth()
  const { running } = useServer()
  const { toast } = useToast()
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [savingCfg, setSavingCfg] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'restore' | 'delete'; name: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [reload, setReload] = useState(0)
  const [unsupported, setUnsupported] = useState(false)

  const headers = authHeaders(token)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiFetch<BackupInfo[]>('/backups', { headers }),
      apiFetch<BackupConfig>('/backups/config', { headers }),
    ])
      .then(([list, cfg]) => {
        if (cancelled) return
        if (list.kind === 'ok') {
          setBackups(list.data)
          setError(null)
          setUnsupported(false)
        } else if (list.kind === 'unsupported') {
          setUnsupported(true)
          setError(null)
        } else if (list.kind === 'unauthorized') {
          logout()
          return
        } else if (list.kind === 'network') {
          setError('Could not reach the server')
        } else {
          setError(list.message)
        }
        if (cfg.kind === 'ok') setConfig(cfg.data)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reload])

  const createNow = async () => {
    setCreating(true)
    toast('Creating a backup… this can take a moment', 'info')
    const r = await apiFetch<BackupInfo>('/backups', { method: 'POST', headers })
    if (r.kind === 'ok') {
      toast('Backup created', 'success')
      setReload((n) => n + 1)
    } else if (r.kind === 'unauthorized') {
      logout()
    } else if (r.kind === 'unsupported') {
      toast('This server build doesn’t support backups', 'error')
    } else if (r.kind === 'network') {
      toast('Backup failed', 'error')
    } else {
      toast(r.message || 'Backup failed', 'error')
    }
    setCreating(false)
  }

  const doRestore = useCallback(
    async (name: string) => {
      const r = await apiFetch('/backups/restore', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      })
      if (r.kind === 'ok') toast(`Restored ${name}`, 'success')
      else if (r.kind === 'unauthorized') logout()
      else if (r.kind === 'unsupported') toast('This server build doesn’t support backups', 'error')
      else if (r.kind === 'network') toast('Restore failed', 'error')
      else toast(r.message || 'Restore failed', 'error')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  )

  const doDelete = useCallback(
    async (name: string) => {
      const r = await apiFetch(`/backups?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers,
      })
      if (r.kind === 'ok') {
        toast('Backup deleted', 'success')
        setReload((n) => n + 1)
      } else if (r.kind === 'unauthorized') logout()
      else if (r.kind === 'unsupported') toast('This server build doesn’t support backups', 'error')
      else if (r.kind === 'network') toast('Delete failed', 'error')
      else toast(r.message || 'Delete failed', 'error')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  )

  const download = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/backups/download?name=${encodeURIComponent(name)}`, { headers })
      if (res.status === 401) { logout(); return }
      if (res.status === 404) {
        toast('This server build doesn’t support downloading backups yet', 'error')
        return
      }
      if (!res.ok) {
        toast('Download failed', 'error')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast('Download failed', 'error')
    }
  }

  const runConfirm = () => {
    if (!confirm) return
    if (confirm.kind === 'restore') doRestore(confirm.name)
    else doDelete(confirm.name)
    setConfirm(null)
  }

  const saveConfig = async () => {
    if (!config) return
    setSavingCfg(true)
    const r = await apiFetch<BackupConfig>('/backups/config', {
      method: 'PUT',
      headers,
      body: JSON.stringify(config),
    })
    if (r.kind === 'ok') {
      toast('Schedule saved', 'success')
      if (r.data) setConfig(r.data)
    } else if (r.kind === 'unauthorized') logout()
    else if (r.kind === 'unsupported') toast('This server build doesn’t support backups', 'error')
    else if (r.kind === 'network') toast('Failed to save schedule', 'error')
    else toast(r.message || 'Failed to save schedule', 'error')
    setSavingCfg(false)
  }

  const intervalOptions = config && !INTERVALS.some((i) => i.m === config.interval_minutes)
    ? [{ m: config.interval_minutes, label: `Every ${config.interval_minutes} min` }, ...INTERVALS]
    : INTERVALS

  return (
    <div className="backups-page">
      <div className="backups-head">
        <div>
          <h2>Backups</h2>
          <p className="backups-note">Timestamped snapshots of your world.</p>
        </div>
        {!unsupported && (
          <button className="bbtn bbtn-primary" onClick={createNow} disabled={creating}>
            <Plus size={15} />
            {creating ? 'Creating…' : 'Back up now'}
          </button>
        )}
      </div>

      {/* Schedule */}
      {config && (
        <section className="backups-schedule">
          <div className="schedule-head">
            <Clock size={16} />
            <span>Automatic backups</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              <span className="switch-track" />
            </label>
          </div>
          <div className="schedule-fields" data-enabled={config.enabled}>
            <label className="field">
              <span>Frequency</span>
              <select
                value={config.interval_minutes}
                onChange={(e) => setConfig({ ...config, interval_minutes: Number(e.target.value) })}
              >
                {intervalOptions.map((i) => (
                  <option key={i.m} value={i.m}>{i.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Keep last</span>
              <input
                type="number"
                min={0}
                value={config.keep}
                onChange={(e) => setConfig({ ...config, keep: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <button className="bbtn" onClick={saveConfig} disabled={savingCfg}>
              <Save size={15} />
              {savingCfg ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>
      )}

      {loading && <p className="backups-loading">Loading…</p>}
      {error && <p className="backups-error">{error}</p>}

      {!loading && unsupported && (
        <div className="backups-empty">
          <Archive size={22} />
          <p>This server build doesn’t include the backups API yet, so managing world backups from here isn’t available.</p>
          <p className="backups-unsupported-sub">This page lights up automatically once the server adds <code>/api/backups</code>.</p>
        </div>
      )}

      {!loading && !error && !unsupported && backups.length === 0 && (
        <div className="backups-empty">
          <Archive size={22} />
          <p>No backups yet. Create one now, or enable automatic backups above.</p>
        </div>
      )}

      {!loading && !error && !unsupported && backups.length > 0 && (
        <ul className="backups-list">
          {backups.map((b, i) => (
            <li key={b.name} className="backup-row stagger-item" style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <Archive size={17} className="backup-icon" />
              <div className="backup-info">
                <span className="backup-name">{b.name}</span>
                <span className="backup-meta">{formatBytes(b.size)} · {formatWhen(b.created, now)}</span>
              </div>
              {confirm && confirm.name === b.name ? (
                <div className="backup-confirm">
                  <span className="confirm-q">{confirm.kind === 'restore' ? 'Overwrite world?' : 'Delete?'}</span>
                  <button className={`bbtn ${confirm.kind === 'restore' ? 'bbtn-warn' : 'bbtn-danger'}`} onClick={runConfirm}>
                    Confirm
                  </button>
                  <button className="bbtn bbtn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
                </div>
              ) : (
                <div className="backup-actions">
                  <button
                    className="bbtn bbtn-icon"
                    onClick={() => download(b.name)}
                    title="Download this backup"
                    aria-label="Download"
                  >
                    <Download size={15} />
                  </button>
                  <button
                    className="bbtn bbtn-icon"
                    onClick={() => setConfirm({ kind: 'restore', name: b.name })}
                    disabled={running}
                    title={running ? 'Stop the server to restore' : 'Restore this backup'}
                    aria-label="Restore"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    className="bbtn bbtn-icon bbtn-danger-ghost"
                    onClick={() => setConfirm({ kind: 'delete', name: b.name })}
                    title="Delete this backup"
                    aria-label="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {running && backups.length > 0 && (
        <p className="backups-hint">Restore is disabled while the server is running — stop it first.</p>
      )}
    </div>
  )
}

export default Backups
