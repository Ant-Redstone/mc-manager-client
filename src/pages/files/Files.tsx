import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Folder, FileText, ChevronRight, ArrowUp, RefreshCw, Upload, UploadCloud, Download, Save, X, Braces,
  Trash2, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/toast/ToastContext'
import { API_BASE, authHeaders, apiFetch } from '../../lib/api'
import { formatBytes } from '../../lib/format'
import { languageFor, checkJson, type JsonCheck } from '../../lib/jsonHighlight'
import CodeEditor from '../../components/editor/CodeEditor'
import './Files.css'

interface FileEntry {
  name: string
  is_dir: boolean
  size: number
  mod_time: string
}

interface APIResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

function Files() {
  const { token, logout } = useAuth()
  const { toast } = useToast()
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ name: string; path: string; content: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const [unsupported, setUnsupported] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const uploadRef = useRef<HTMLInputElement>(null)
  // The entry the user is about to delete (drives the confirmation dialog).
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  // A failed JSON check the user is being asked to save anyway (some mod
  // configs use JSON5-ish extensions — comments, trailing commas — that are
  // "invalid" to JSON.parse but perfectly valid to the mod reading them).
  const [pendingInvalidSave, setPendingInvalidSave] = useState<JsonCheck | null>(null)
  const cancelInvalidSaveRef = useRef<HTMLButtonElement>(null)

  const headers = authHeaders(token)

  // While the confirm dialog is open: focus Cancel and let Esc dismiss it.
  useEffect(() => {
    if (!pendingDelete) return
    cancelDeleteRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) setPendingDelete(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingDelete, deleting])

  useEffect(() => {
    if (!pendingInvalidSave) return
    cancelInvalidSaveRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingInvalidSave(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingInvalidSave])

  useEffect(() => {
    let cancelled = false
    apiFetch<FileEntry[]>(`/files?path=${encodeURIComponent(path)}`, { headers })
      .then((r) => {
        if (cancelled) return
        if (r.kind === 'ok') {
          const sorted = [...r.data].sort((a, b) => {
            if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          setEntries(sorted)
          setError(null)
          setUnsupported(false)
        } else if (r.kind === 'unsupported') {
          setUnsupported(true)
          setError(null)
        } else if (r.kind === 'unauthorized') {
          logout()
        } else if (r.kind === 'network') {
          setError('Could not reach the server')
        } else {
          setError(r.message)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, token, reload])

  const joinPath = (name: string) => (path ? `${path}/${name}` : name)

  const openEntry = useCallback(
    async (entry: FileEntry) => {
      if (entry.is_dir) {
        setPath(joinPath(entry.name))
        return
      }
      const filePath = joinPath(entry.name)
      const r = await apiFetch<string>(`/files/read?path=${encodeURIComponent(filePath)}`, { headers })
      if (r.kind === 'ok') {
        setEditing({ name: entry.name, path: filePath, content: r.data ?? '' })
        setDirty(false)
      } else if (r.kind === 'unauthorized') {
        logout()
      } else if (r.kind === 'unsupported') {
        toast('This server build doesn’t support the file API', 'error')
      } else if (r.kind === 'network') {
        toast('Could not read the file', 'error')
      } else {
        toast(r.message || 'That file can’t be opened as text — try downloading it', 'error')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, token],
  )

  // The actual PUT — always runs, whether the content is valid JSON, isn't
  // JSON at all, or the user chose to save invalid JSON anyway.
  const doSave = async () => {
    if (!editing) return
    setSaving(true)
    const r = await apiFetch(`/files?path=${encodeURIComponent(editing.path)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: editing.content }),
    })
    if (r.kind === 'ok') {
      toast(`Saved ${editing.name}`, 'success')
      setDirty(false)
    } else if (r.kind === 'unauthorized') {
      logout()
    } else if (r.kind === 'unsupported') {
      toast('This server build doesn’t support the file API', 'error')
    } else if (r.kind === 'network') {
      toast('Could not save the file', 'error')
    } else {
      toast(r.message || 'Failed to save', 'error')
    }
    setSaving(false)
  }

  // Invalid JSON gets a heads-up, not a hard block — some mod configs use
  // extensions standard JSON doesn't allow (comments, trailing commas) and are
  // still valid to the mod reading them.
  const saveFile = () => {
    if (!editing) return
    if (languageFor(editing.name) === 'json') {
      const check = checkJson(editing.content)
      if (!check.ok) {
        setPendingInvalidSave(check)
        return
      }
    }
    doSave()
  }

  const confirmSaveAnyway = () => {
    setPendingInvalidSave(null)
    doSave()
  }

  const download = async (entry: FileEntry) => {
    const filePath = joinPath(entry.name)
    try {
      const res = await fetch(`${API_BASE}/files/download?path=${encodeURIComponent(filePath)}`, { headers })
      if (res.status === 401) { logout(); return }
      if (res.status === 404) {
        toast('This server build doesn’t support the file API', 'error')
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
      a.download = entry.name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast('Download failed', 'error')
    }
  }

  // Delete the entry the dialog is confirming. Directories go recursively, so
  // the dialog spells that out before the user commits.
  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    const filePath = joinPath(target.name)
    setDeleting(true)
    const r = await apiFetch(`/files?path=${encodeURIComponent(filePath)}`, { method: 'DELETE', headers })
    setDeleting(false)
    if (r.kind === 'ok') {
      toast(`Deleted ${target.name}`, 'success')
      setPendingDelete(null)
      // Close the editor if it was showing the file we just removed.
      if (editing && editing.path === filePath) setEditing(null)
      setReload((n) => n + 1)
    } else if (r.kind === 'unauthorized') {
      logout()
    } else if (r.kind === 'unsupported') {
      toast('This server build doesn’t support deleting files yet', 'error')
      setPendingDelete(null)
    } else if (r.kind === 'network') {
      toast('Could not delete — the server is unreachable', 'error')
    } else {
      toast(r.message || `Couldn’t delete ${target.name}`, 'error')
    }
  }

  // Upload each file as its own request — the backend takes one file per POST,
  // so multiple selected/dropped files fan out into N uploads.
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return
    let ok = 0
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      try {
        const res = await fetch(`${API_BASE}/files/upload?path=${encodeURIComponent(path)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' },
          body: form,
        })
        if (res.status === 401) { logout(); return }
        if (res.status === 404) { toast('This server build doesn’t support the file API', 'error'); return }
        const data: APIResponse = await res.json()
        if (data.success) ok += 1
        else toast(data.error ?? `Couldn’t upload ${file.name}`, 'error')
      } catch {
        toast(`Couldn’t upload ${file.name}`, 'error')
      }
    }
    if (ok > 0) {
      toast(files.length === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${ok} of ${files.length} files`, 'success')
      setReload((n) => n + 1)
    }
  }

  // Drag-and-drop upload. A depth counter keeps the overlay from flickering as
  // dragenter/leave fire across nested children.
  const hasFiles = (e: React.DragEvent) => !!e.dataTransfer?.types?.includes('Files')
  const onDragEnter = (e: React.DragEvent) => {
    if (unsupported || !hasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!unsupported && hasFiles(e)) e.preventDefault() // required for the drop to fire
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }
  const onDrop = (e: React.DragEvent) => {
    if (unsupported || !hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const dropped = e.dataTransfer?.files
    if (dropped && dropped.length) uploadFiles(Array.from(dropped))
  }

  const crumbs = path ? path.split('/') : []

  if (editing) {
    const lang = languageFor(editing.name)
    const jsonState = lang === 'json' ? checkJson(editing.content) : null
    const lineCount = editing.content ? editing.content.split('\n').length : 0
    const formatJson = () => {
      try {
        const pretty = JSON.stringify(JSON.parse(editing.content), null, 2)
        setEditing((cur) => (cur ? { ...cur, content: pretty } : cur))
        setDirty(true)
        toast('Formatted', 'success')
      } catch {
        toast("Can't format — the JSON isn't valid yet", 'error')
      }
    }
    return (
      <div className="files-page">
        <div className="file-editor">
          <div className="file-editor-bar">
            <FileText size={16} className="file-editor-icon" />
            <span className="file-editor-name">{editing.path}</span>
            {dirty && <span className="file-editor-dirty" title="Unsaved changes">●</span>}
            {lang === 'json' && (
              <button className="fbtn fbtn-ghost" onClick={formatJson} title="Format JSON">
                <Braces size={15} />
                Format
              </button>
            )}
            <button className="fbtn" onClick={saveFile} disabled={!dirty || saving}>
              <Save size={15} />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="fbtn fbtn-ghost" onClick={() => setEditing(null)} aria-label="Close editor">
              <X size={15} />
            </button>
          </div>
          <CodeEditor
            value={editing.content}
            language={lang}
            ariaLabel={`Editing ${editing.name}`}
            onChange={(content) => {
              setEditing((cur) => (cur ? { ...cur, content } : cur))
              setDirty(true)
            }}
          />
          <div className="file-editor-status">
            {jsonState ? (
              jsonState.ok ? (
                <span className="fe-ok"><span className="fe-dot" />Valid JSON</span>
              ) : (
                <span className="fe-bad"><span className="fe-dot" />Invalid JSON{jsonState.line ? ` · line ${jsonState.line}` : ''}</span>
              )
            ) : (
              <span className="fe-muted">{lang === 'properties' ? 'Properties' : 'Plain text'}</span>
            )}
            <span className="fe-meta">{lineCount} lines · {editing.content.length.toLocaleString()} chars</span>
          </div>
        </div>

        {pendingInvalidSave && (
          <div className="files-modal-scrim" onClick={() => setPendingInvalidSave(null)}>
            <div
              className="files-modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="files-json-title"
              aria-describedby="files-json-body"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="files-modal-icon files-modal-icon-warn"><AlertTriangle size={20} /></div>
              <h3 id="files-json-title" className="files-modal-title">This doesn’t look like valid JSON</h3>
              <p id="files-json-body" className="files-modal-body">
                {pendingInvalidSave.error}{pendingInvalidSave.line ? ` (line ${pendingInvalidSave.line})` : ''}.
                Some mod configs use things standard JSON doesn’t allow — comments, trailing commas — and are
                still valid to the mod reading them. Save anyway if you’re sure this is correct.
              </p>
              <div className="files-modal-actions">
                <button ref={cancelInvalidSaveRef} className="fbtn fbtn-ghost" onClick={() => setPendingInvalidSave(null)}>
                  Keep editing
                </button>
                <button className="fbtn fbtn-warn" onClick={confirmSaveAnyway}>
                  <Save size={15} />
                  Save anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`files-page ${dragging ? 'is-dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="files-dropzone" aria-hidden="true">
          <UploadCloud size={34} />
          <p>Drop files to upload{path ? ` to ${path}` : ''}</p>
        </div>
      )}
      <div className="files-bar">
        <nav className="files-crumbs" aria-label="Path">
          <button className="crumb" onClick={() => setPath('')}>server</button>
          {crumbs.map((seg, i) => (
            <span key={i} className="crumb-seg">
              <ChevronRight size={13} className="crumb-sep" />
              <button className="crumb" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}>
                {seg}
              </button>
            </span>
          ))}
        </nav>
        <div className="files-actions">
          <button className="fbtn fbtn-icon" onClick={() => setPath(parentPath(path))} disabled={!path} title="Up one level" aria-label="Up one level">
            <ArrowUp size={15} />
          </button>
          <button className="fbtn fbtn-icon" onClick={() => setReload((n) => n + 1)} title="Refresh" aria-label="Refresh">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
          <button className="fbtn" onClick={() => uploadRef.current?.click()}>
            <Upload size={15} />
            Upload
          </button>
          <input
            ref={uploadRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const fs = e.target.files
              if (fs && fs.length) uploadFiles(Array.from(fs))
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {loading && <p className="files-loading">Loading…</p>}
      {error && <p className="files-error">{error}</p>}

      {!loading && unsupported && (
        <div className="files-unsupported">
          <Folder size={22} />
          <p>This server build doesn’t include the file API yet, so browsing files from here isn’t available.</p>
          <p className="files-unsupported-sub">Everything else keeps working — this page lights up automatically once the server adds <code>/api/files</code>.</p>
        </div>
      )}

      {!loading && !error && !unsupported && entries.length === 0 && (
        <p className="files-empty">This folder is empty.</p>
      )}

      {!loading && !error && !unsupported && entries.length > 0 && (
        <ul className="files-list">
          {entries.map((entry, i) => (
            <li key={entry.name} className="file-row stagger-item" style={{ '--i': Math.min(i, 14) } as React.CSSProperties}>
              <button className="file-main" onClick={() => openEntry(entry)}>
                {entry.is_dir ? (
                  <Folder size={17} className="file-icon file-icon-dir" />
                ) : (
                  <FileText size={17} className="file-icon" />
                )}
                <span className="file-name">{entry.name}</span>
                {!entry.is_dir && <span className="file-size">{formatBytes(entry.size)}</span>}
                {entry.is_dir && <ChevronRight size={15} className="file-go" />}
              </button>
              {!entry.is_dir && (
                <button className="fbtn fbtn-icon file-dl" onClick={() => download(entry)} title="Download" aria-label={`Download ${entry.name}`}>
                  <Download size={14} />
                </button>
              )}
              <button
                className="fbtn fbtn-icon file-del"
                onClick={() => setPendingDelete(entry)}
                title={`Delete ${entry.name}`}
                aria-label={`Delete ${entry.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <div className="files-modal-scrim" onClick={() => !deleting && setPendingDelete(null)}>
          <div
            className="files-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="files-del-title"
            aria-describedby="files-del-body"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="files-modal-icon"><AlertTriangle size={20} /></div>
            <h3 id="files-del-title" className="files-modal-title">
              Delete {pendingDelete.is_dir ? 'this folder' : 'this file'}?
            </h3>
            <p id="files-del-body" className="files-modal-body">
              <b>{pendingDelete.name}</b>
              {pendingDelete.is_dir ? ' and everything inside it' : ''} will be permanently deleted. This can’t be undone.
            </p>
            <div className="files-modal-actions">
              <button ref={cancelDeleteRef} className="fbtn fbtn-ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="fbtn fbtn-danger" onClick={confirmDelete} disabled={deleting}>
                <Trash2 size={15} />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Files
