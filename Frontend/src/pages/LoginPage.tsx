import { useState } from 'react'
import type { UserResponse } from '../types'

interface LoginPageProps {
  apiBaseUrl: string
  onLoginSuccess: (user: UserResponse) => void
  onNavigateToRegister: () => void
}

export function LoginPage({
  apiBaseUrl,
  onLoginSuccess,
  onNavigateToRegister,
}: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid email or password.')
        }
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.detail || `Login failed (${response.status})`)
      }

      const userData: UserResponse = await response.json()
      onLoginSuccess(userData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand" style={{ justifyContent: 'center', marginBottom: '16px' }}>
            <div className="brand-mark">F</div>
            <span>FinSight</span>
          </div>
          <h2>Welcome back</h2>
          <p className="auth-subtitle">Sign in to access your financial overview</p>
        </div>

        {error && (
          <div className="auth-error-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-field">
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <span>Don't have an account?</span>{' '}
          <button
            type="button"
            className="auth-toggle-link"
            onClick={onNavigateToRegister}
          >
            Create an account
          </button>
        </div>
      </div>
    </div>
  )
}
