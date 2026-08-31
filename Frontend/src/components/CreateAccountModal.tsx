import { useState } from 'react'
import type { AccountItem } from '../types'

interface CreateAccountModalProps {
  isOpen: boolean
  onClose: () => void
  onAccountCreated: (account: AccountItem) => void
  apiBaseUrl: string
}

export function CreateAccountModal({
  isOpen,
  onClose,
  onAccountCreated,
  apiBaseUrl,
}: CreateAccountModalProps) {
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('savings')
  const [institution, setInstitution] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Account name is required.')
      return
    }

    if (!currency.trim() || currency.trim().length !== 3) {
      setError('Currency must be a 3-letter code (e.g. INR, USD, EUR).')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          account_type: accountType.trim().toLowerCase(),
          institution: institution.trim() || null,
          currency: currency.trim().toUpperCase(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          errorData?.detail || `Failed to create account (${response.status})`
        )
      }

      const newAccount: AccountItem = await response.json()
      setName('')
      setAccountType('savings')
      setInstitution('')
      setCurrency('INR')
      onAccountCreated(newAccount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow" style={{ margin: '0 0 4px' }}>
              Connected Accounts
            </p>
            <h2 className="modal-title">Connect New Account</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="auth-error-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-field">
            <label htmlFor="account-name">
              Account Name <span style={{ color: '#bd4a42' }}>*</span>
            </label>
            <input
              id="account-name"
              type="text"
              placeholder="e.g. Primary Savings, Daily Checking"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="account-type">
              Account Type <span style={{ color: '#bd4a42' }}>*</span>
            </label>
            <select
              id="account-type"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              disabled={loading}
              className="form-select"
              required
            >
              <option value="savings">Savings</option>
              <option value="checking">Checking</option>
              <option value="credit">Credit Card</option>
              <option value="investment">Investment</option>
              <option value="cash">Cash Wallet</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="institution">Financial Institution (Optional)</label>
            <input
              id="institution"
              type="text"
              placeholder="e.g. HDFC Bank, SBI, Chase, Fidelity"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-field">
            <label htmlFor="currency">Currency Code</label>
            <input
              id="currency"
              type="text"
              maxLength={3}
              placeholder="INR"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              disabled={loading}
              required
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="secondary-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Creating...' : 'Connect Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
