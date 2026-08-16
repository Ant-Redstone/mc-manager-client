import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_BASE } from '../../lib/api'
import './Auth.css'

function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [token, setToken] = useState(searchParams.get('token') ?? '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  // Reset validity when the token field is emptied. Adjusting state during
  // render (guarded so it can't loop) is React's supported pattern for a
  // derived reset, and keeps the synchronous set out of the effect where it
  // trips react-hooks/set-state-in-effect.
  if (!token && tokenValid !== null) {
    setTokenValid(null)
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch(`${API_BASE}/invitations/${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTokenValid(data.success)
      })
      .catch(() => {
        if (!cancelled) setTokenValid(false)
      })
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      await register(token, username, password)
      navigate('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create Account</h1>
        <p>Use your invitation to register</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          <div className="auth-field">
            <label htmlFor="token">Invitation Token</label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              placeholder="Paste your invitation token"
            />
            {tokenValid === true && <span style={{ color: '#4ecca3', fontSize: '0.8rem' }}>Valid invitation</span>}
            {tokenValid === false && <span style={{ color: '#e94560', fontSize: '0.8rem' }}>Invalid or expired invitation</span>}
          </div>
          <div className="auth-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button className="auth-submit" type="submit" disabled={loading || tokenValid === false}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <div className="auth-link">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default Register
