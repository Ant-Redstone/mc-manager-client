import { useCallback, useEffect, useRef, useState } from 'react'
import { Undo2, Save, Info } from 'lucide-react'
import { useServer, type CreateServerConfig } from '../../context/ServerContext'
import { defaultProperties, basicPropertyFields, advancedPropertyFields, type PropertyField } from '../../types/properties'
import './ServerSetup.css'

interface GameVersion {
  id: string
  type: string
}

interface FabricLoaderVersion {
  loader: { version: string; stable: boolean }
}

function ServerSetup() {
  const { serverExists, loading, createServer, deleteServer, updateProperties, fetchProperties, running, serverInfo, handleStop, handleStart } = useServer()

  const [serverType, setServerType] = useState('vanilla')
  const [releaseVersion, setReleaseVersion] = useState('')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [configureProperties, setConfigureProperties] = useState(false)
  const [properties, setProperties] = useState<Record<string, string>>(() => {
    const props: Record<string, string> = {}
    for (const [key, value] of Object.entries(defaultProperties)) {
      props[key] = String(value)
    }
    return props
  })

  const [gameVersions, setGameVersions] = useState<GameVersion[]>([])
  const [loaderVersions, setLoaderVersions] = useState<string[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)

  // Fetch game versions from Mojang manifest
  useEffect(() => {
    fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')
      .then((res) => res.json())
      .then((data) => {
        const releases = data.versions.filter((v: GameVersion) => v.type === 'release')
        setGameVersions(releases)
        if (releases.length > 0 && !releaseVersion) {
          setReleaseVersion(releases[0].id)
        }
      })
      .catch(() => {})
      .finally(() => setVersionsLoading(false))
  }, [])

  // Clear stale Fabric loader choices when they no longer apply (render-phase
  // adjustment, guarded against a render loop — keeps the synchronous clear out
  // of the effect where it trips react-hooks/set-state-in-effect).
  const loadersApply = serverType === 'fabric' && !!releaseVersion
  if (!loadersApply && (loaderVersions.length > 0 || loaderVersion !== '')) {
    setLoaderVersions([])
    setLoaderVersion('')
  }

  // Fetch Fabric loader versions when serverType is fabric and a game version is selected
  useEffect(() => {
    if (serverType !== 'fabric' || !releaseVersion) return

    fetch(`https://meta.fabricmc.net/v2/versions/loader/${releaseVersion}`)
      .then((res) => res.json())
      .then((data: FabricLoaderVersion[]) => {
        const versions = data.filter((v) => v.loader.stable).map((v) => v.loader.version)
        setLoaderVersions(versions)
        if (versions.length > 0) {
          setLoaderVersion(versions[0])
        }
      })
      .catch(() => setLoaderVersions([]))
  }, [serverType, releaseVersion])

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [savedProperties, setSavedProperties] = useState<Record<string, string>>({})

  const hasChanges = Object.keys(savedProperties).length > 0 &&
    Object.keys(properties).some((key) => properties[key] !== savedProperties[key])

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    if (!hasChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  const handleDiscard = useCallback(() => {
    setProperties({ ...savedProperties })
    setError('')
  }, [savedProperties])

  // Load properties from server when server exists
  useEffect(() => {
    if (serverExists) {
      fetchProperties()
        .then((serverProps) => {
          if (serverProps && Object.keys(serverProps).length > 0) {
            setProperties((prev) => ({ ...prev, ...serverProps }))
            setSavedProperties((prev) => ({ ...prev, ...serverProps }))
          }
        })
        .catch(() => {})
    }
  }, [serverExists])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const config: CreateServerConfig = {
      serverType,
      releaseVersion,
      loaderVersion: serverType === 'fabric' ? loaderVersion : undefined,
      createLaunchScript: true,
      configureProperties,
      properties: configureProperties ? properties : {},
    }

    try {
      await createServer(config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create server')
    }
  }

  const handleSaveProperties = async () => {
    setError('')
    setSaveSuccess(false)

    // Client-side validation for numeric fields
    const numericRules: Record<string, { min: number; max: number; label: string }> = {
      'server-port': { min: 1, max: 65535, label: 'Server Port' },
      'query.port': { min: 1, max: 65535, label: 'Query Port' },
      'rcon.port': { min: 1, max: 65535, label: 'RCON Port' },
      'max-players': { min: 1, max: 2147483647, label: 'Max Players' },
      'view-distance': { min: 3, max: 32, label: 'View Distance' },
      'simulation-distance': { min: 3, max: 32, label: 'Simulation Distance' },
      'op-permission-level': { min: 1, max: 4, label: 'OP Permission Level' },
      'function-permission-level': { min: 1, max: 4, label: 'Function Permission Level' },
      'spawn-protection': { min: 0, max: 2147483647, label: 'Spawn Protection' },
      'entity-broadcast-range-percentage': { min: 10, max: 500, label: 'Entity Broadcast Range %' },
      'max-world-size': { min: 1, max: 29999984, label: 'Max World Size' },
    }

    for (const [key, rule] of Object.entries(numericRules)) {
      if (properties[key] !== undefined) {
        const num = Number(properties[key])
        if (isNaN(num) || num < rule.min || num > rule.max) {
          setError(`${rule.label} must be between ${rule.min} and ${rule.max}`)
          return
        }
      }
    }

    setSaving(true)
    try {
      await updateProperties(properties)
      setSaveSuccess(true)
      setSavedProperties({ ...properties })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save properties')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setError('')
    try {
      await deleteServer()
      setShowDeleteConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete server')
    }
  }

  const handlePropertyChange = (key: string, value: string) => {
    setProperties((prev) => ({ ...prev, [key]: value }))
  }

  // Property description is a full table column on desktop, but collapses into
  // a tap-to-open tooltip (via the info icon) on narrow/mobile layouts.
  const [openTooltip, setOpenTooltip] = useState<string | null>(null)
  const tooltipContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openTooltip) return
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (!tooltipContainerRef.current?.contains(e.target as Node)) {
        setOpenTooltip(null)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [openTooltip])

  const renderInput = (field: PropertyField, prefix: string) => {
    if (field.type === 'boolean') {
      return (
        <input
          id={`${prefix}-${field.key}`}
          type="checkbox"
          checked={properties[field.key] === 'true'}
          onChange={(e) => handlePropertyChange(field.key, String(e.target.checked))}
        />
      )
    }
    if (field.type === 'select') {
      return (
        <select
          id={`${prefix}-${field.key}`}
          value={properties[field.key]}
          onChange={(e) => handlePropertyChange(field.key, e.target.value)}
        >
          {field.options!.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        id={`${prefix}-${field.key}`}
        type={field.type === 'number' ? 'number' : 'text'}
        value={properties[field.key]}
        onChange={(e) => handlePropertyChange(field.key, e.target.value)}
      />
    )
  }

  const renderPropRow = (field: PropertyField, prefix: string) => (
    <tr key={field.key}>
      <td className="prop-name">
        <span className="prop-name-text">{field.label}</span>
        <span className="prop-tooltip-container" ref={openTooltip === field.key ? tooltipContainerRef : undefined}>
          <button
            type="button"
            className="prop-info-btn"
            title={field.description}
            aria-label={`About ${field.label}`}
            aria-expanded={openTooltip === field.key}
            onClick={() => setOpenTooltip((prev) => (prev === field.key ? null : field.key))}
          >
            <Info size={13} />
          </button>
          {openTooltip === field.key && (
            <div className="prop-tooltip" role="tooltip">
              {field.description}
            </div>
          )}
        </span>
      </td>
      <td className="prop-value">{renderInput(field, prefix)}</td>
      <td className="prop-desc">{field.description}</td>
    </tr>
  )

  if (serverExists) {
    return (
      <div className="server-setup-page">
        <h2>Server Management</h2>

        {error && <p className="setup-error">{error}</p>}

        <div className="server-info-card">
          <div className="server-info">
            <h3>Server Info</h3>
            <div className="server-info-grid">
              <div className="server-info-item">
                <span className="info-label">Type</span>
                <span className="info-value">{serverInfo?.serverType || 'Unknown'}</span>
              </div>
              <div className="server-info-item">
                <span className="info-label">Game Version</span>
                <span className="info-value">{serverInfo?.gameVersion || 'Unknown'}</span>
              </div>
              {serverInfo?.loaderVersion && (
                <div className="server-info-item">
                  <span className="info-label">Loader Version</span>
                  <span className="info-value">{serverInfo.loaderVersion}</span>
                </div>
              )}
            </div>
          </div>

          <div className="server-info-actions">
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={running || loading}
            >
              Delete Server
            </button>

            {running && (
              <p className="setup-hint">Stop the server before deleting it.</p>
            )}
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Server</h3>
              <p className="delete-warning">
                This will permanently delete the server jar, world data, and all configuration files. This action cannot be undone.
              </p>
              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="properties-table-wrapper">
          <table className="properties-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {basicPropertyFields.map((field) => renderPropRow(field, 'prop'))}
              {showAdvanced && advancedPropertyFields.map((field) => renderPropRow(field, 'prop'))}
            </tbody>
          </table>
        </div>

        <div className="properties-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          </button>

          <div className="properties-actions-right">
            {hasChanges && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDiscard}
              >
                <Undo2 size={14} />
                Discard Changes
              </button>
            )}

            <button className="btn btn-primary" disabled={loading || saving || !hasChanges} onClick={handleSaveProperties}>
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Properties'}
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="modal-overlay" onClick={() => setSaveSuccess(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Properties Saved</h3>
              <p>Changes to server properties require a restart to take effect.</p>
              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setSaveSuccess(false)}
                >
                  OK
                </button>
                {running && (
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      setSaveSuccess(false)
                      await handleStop()
                      await handleStart()
                    }}
                    disabled={loading}
                  >
                    Restart Now
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    )
  }

  return (
    <div className="server-setup-page">
      <h2>Create Server</h2>

      {error && <p className="setup-error">{error}</p>}

      <form className="setup-form" onSubmit={handleCreate}>
        <div className="setup-section">
          <h3>Server Type</h3>
          <div className="setup-field">
            <label htmlFor="serverType">Type</label>
            <select
              id="serverType"
              value={serverType}
              onChange={(e) => setServerType(e.target.value)}
            >
              <option value="vanilla">Vanilla</option>
              <option value="fabric">Fabric</option>
            </select>
          </div>

          <div className="setup-field">
            <label htmlFor="releaseVersion">Game Version</label>
            <select
              id="releaseVersion"
              value={releaseVersion}
              onChange={(e) => setReleaseVersion(e.target.value)}
              disabled={versionsLoading}
            >
              {gameVersions.map((v) => (
                <option key={v.id} value={v.id}>{v.id}</option>
              ))}
            </select>
          </div>

          {serverType === 'fabric' && (
            <div className="setup-field">
              <label htmlFor="loaderVersion">Loader Version</label>
              <select
                id="loaderVersion"
                value={loaderVersion}
                onChange={(e) => setLoaderVersion(e.target.value)}
                disabled={loaderVersions.length === 0}
              >
                {loaderVersions.length === 0 && (
                  <option value="">Loading...</option>
                )}
                {loaderVersions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="setup-section">
          <h3>
            <label className="setup-toggle">
              <input
                type="checkbox"
                checked={configureProperties}
                onChange={(e) => setConfigureProperties(e.target.checked)}
              />
              Configure Properties
            </label>
          </h3>

          {configureProperties && (
            <>
              <div className="properties-table-wrapper">
                <table className="properties-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Value</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {basicPropertyFields.map((field) => renderPropRow(field, 'setup'))}
                    {showAdvanced && advancedPropertyFields.map((field) => renderPropRow(field, 'setup'))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="btn btn-secondary advanced-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
              </button>
            </>
          )}
        </div>

        <button type="submit" className="btn btn-create" disabled={loading}>
          {loading ? 'Creating...' : 'Create Server'}
        </button>
      </form>
    </div>
  )
}

export default ServerSetup
