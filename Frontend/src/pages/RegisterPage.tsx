import { useState } from 'react'
import type { UserResponse } from '../types'

interface RegisterPageProps {
  apiBaseUrl: string
  onRegisterSuccess: (user: UserResponse) => void
  onNavigateToLogin: () => void
}

export function RegisterPage({
  apiBaseUrl,
  onRegisterSuccess,
  onNavigateToLogin,
}: RegisterPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Please fill in all required fields.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Register user
      const registerRes = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      if (!registerRes.ok) {
        if (registerRes.status === 409) {
          throw new Error('An account with this email already exists.')
        }
        const errorData = await registerRes.json().catch(() => null)
        throw new Error(errorData?.detail || `Registration failed (${registerRes.status})`)
      }

      // 2. Automatically log in after registration to obtain session cookie
      const loginRes = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      if (!loginRes.ok) {
        throw new Error('Registration succeeded, but auto-login failed. Please sign in.')
      }

      const userData: UserResponse = await loginRes.json()
      onRegisterSuccess(userData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
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
          <h2>Create your account</h2>
          <p className="auth-subtitle">Start tracking your wealth and cash flow</p>
        </div>

        {error && (
          <div className="auth-error-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-field">
            <label htmlFor="reg-email">Email Address</label>
            <input
              id="reg-email"
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
            <label htmlFor="reg-password">Password (min. 8 characters)</label>
            <input
              id="reg-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="reg-confirm-password">Confirm Password</label>
            <input
              id="reg-confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <span>Already have an account?</span>{' '}
          <button
            type="button"
            className="auth-toggle-link"
            onClick={onNavigateToLogin}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
