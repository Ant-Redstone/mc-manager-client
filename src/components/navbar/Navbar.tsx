import { Link } from 'react-router-dom'
import { ServerCog } from 'lucide-react'
import { useServer } from '../../context/ServerContext'
import { usePermissions } from '../../context/PermissionsContext'
import { useServers } from '../../context/ServersContext'
import './Navbar.css'

function Navbar() {
  const { running, loading, actionError, handleStart, handleStop } = useServer()
  const { can } = usePermissions()
  const canStop = can('server.stop')
  const canStart = can('server.start')
  const { supported, servers, currentServerId } = useServers()
  const currentServer = servers.find((s) => s.id === currentServerId)

  return (
    <header className="header">
      <div className="header-title">
        <h1>MC Manager</h1>
        {supported && currentServer && (
          <Link to="/servers" className="server-chip" title={`Managing ${currentServer.name} — switch server`}>
            <ServerCog size={13} />
            {currentServer.name}
          </Link>
        )}
      </div>
      <div className="controls">
        {actionError && (
          <span className="action-error" role="alert" title={actionError}>
            {actionError}
          </span>
        )}
        <span className={`status-dot ${running ? 'online' : 'offline'}`} />
        <span className="status-text">{running ? 'Running' : 'Stopped'}</span>
        {running ? (
          <button
            onClick={handleStop}
            disabled={loading || !canStop}
            className="btn btn-stop"
            title={canStop ? undefined : "You don't have permission to stop the server"}
          >
            {loading ? 'Stopping...' : 'Stop Server'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={loading || !canStart}
            className="btn btn-start"
            title={canStart ? undefined : "You don't have permission to start the server"}
          >
            {loading ? 'Starting...' : 'Start Server'}
          </button>
        )}
      </div>
    </header>
  )
}

export default Navbar
