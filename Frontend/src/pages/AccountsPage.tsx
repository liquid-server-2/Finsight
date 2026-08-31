import { useEffect, useState } from 'react'
import type { AccountItem, MerchantRuleItem } from '../types'

interface AccountsPageProps {
  accounts: AccountItem[]
  selectedAccountId: number | null
  onSelectAccount: (accountId: number) => void
  onOpenCreateAccount: () => void
  onOpenCsvImport: (account: AccountItem) => void
  loading: boolean
  error: string | null
  onRetry: () => void
  onNavigateToDashboard: () => void
  apiBaseUrl?: string
}

export function AccountsPage({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onOpenCreateAccount,
  onOpenCsvImport,
  loading,
  error,
  onRetry,
  onNavigateToDashboard,
  apiBaseUrl = 'http://127.0.0.1:8000',
}: AccountsPageProps) {
  const [merchantRules, setMerchantRules] = useState<MerchantRuleItem[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null)
  const [ruleError, setRuleError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    const loadRules = async () => {
      try {
        setRulesLoading(true)
        const res = await fetch(`${apiBaseUrl}/api/merchant-rules`, {
          credentials: 'include',
        })
        if (res.ok) {
          const data: MerchantRuleItem[] = await res.json()
          if (!ignore) {
            setMerchantRules(data)
            setRuleError(null)
          }
        }
      } catch {
        // Non-blocking error
      } finally {
        if (!ignore) {
          setRulesLoading(false)
        }
      }
    }

    loadRules()

    return () => {
      ignore = true
    }
  }, [apiBaseUrl])

  const handleDeleteRule = async (rule: MerchantRuleItem) => {
    setDeletingRuleId(rule.merchant_id)
    setRuleError(null)

    try {
      const res = await fetch(`${apiBaseUrl}/api/merchant-rules/${rule.merchant_id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error(`Failed to delete rule (${res.status})`)
      }
      setMerchantRules((prev) => prev.filter((r) => r.merchant_id !== rule.merchant_id))
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : 'Failed to delete merchant rule.')
    } finally {
      setDeletingRuleId(null)
    }
  }

  if (loading) {
    return (
      <div className="state-container">
        <div className="loading-spinner" />
        <p className="eyebrow">Loading your accounts...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="state-container">
        <div className="error-banner">
          <h3>Failed to load accounts</h3>
          <p>{error}</p>
          <button type="button" className="retry-button" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="accounts-page">
      <header className="topbar">
        <div>
          <button
            type="button"
            className="back-button"
            onClick={onNavigateToDashboard}
          >
            ← Back to Dashboard
          </button>
          <h1 style={{ marginTop: '6px' }}>Connected Accounts</h1>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="primary-action-btn"
            onClick={onOpenCreateAccount}
          >
            + Connect Account
          </button>
          <div className="page-meta-badge">
            {accounts.length} {accounts.length === 1 ? 'Account' : 'Accounts'}
          </div>
        </div>
      </header>

      <div className="results-summary-row">
        <span>
          Manage your financial accounts and select the active workspace.
        </span>
      </div>

      {accounts.length === 0 ? (
        <section className="panel empty-account-prominent">
          <div className="empty-state-card">
            <div className="empty-state-icon">🏦</div>
            <h2>No connected accounts yet</h2>
            <p>
              Connect your bank, savings, or checking account to start tracking transactions and cash flow.
            </p>
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: '18px' }}
              onClick={onOpenCreateAccount}
            >
              + Connect Your First Account
            </button>
          </div>
        </section>
      ) : (
        <section className="accounts-grid">
          {accounts.map((account) => {
            const isSelected = account.id === selectedAccountId

            return (
              <article
                key={account.id}
                className={`account-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectAccount(account.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectAccount(account.id)
                  }
                }}
              >
                <div className="account-card-header">
                  <div className="account-title-group">
                    <div className="account-avatar">
                      {account.name.charAt(0)}
                    </div>
                    <div>
                      <h3>{account.name}</h3>
                      <span className="account-id-tag">Account #{account.id}</span>
                    </div>
                  </div>

                  <span
                    className={`account-type-badge ${account.account_type.toLowerCase()}`}
                  >
                    {account.account_type.toUpperCase()}
                  </span>
                </div>

                <div className="account-card-details">
                  <div className="detail-item">
                    <span className="detail-label">Institution</span>
                    <strong className="detail-value">
                      {account.institution || 'N/A'}
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Currency</span>
                    <strong className="detail-value">{account.currency}</strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">Connected On</span>
                    <strong className="detail-value">
                      {new Date(account.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </strong>
                  </div>
                </div>

                <div className="account-card-footer">
                  <div className="card-footer-actions">
                    <button
                      type="button"
                      className="import-csv-pill-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectAccount(account.id)
                        onOpenCsvImport(account)
                      }}
                      title="Upload CSV statement for this account"
                    >
                      📄 Import CSV
                    </button>

                    {isSelected ? (
                      <span className="active-account-indicator">
                        <span className="check-icon">✓</span> Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="select-account-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectAccount(account.id)
                        }}
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {/* Merchant Categorization Rules Management */}
      <section className="panel merchant-rules-panel" style={{ marginTop: '32px' }}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Categorization Preferences</p>
            <h2>Merchant Category Rules</h2>
          </div>
          <span className="page-meta-badge">
            {merchantRules.length} {merchantRules.length === 1 ? 'Rule' : 'Rules'}
          </span>
        </div>

        <p className="card-meta" style={{ marginBottom: '16px' }}>
          Saved merchant preferences automatically categorize future CSV imports without affecting historical transactions.
        </p>

        {ruleError && (
          <div className="inline-edit-error" style={{ marginBottom: '12px', display: 'block' }}>
            {ruleError}
          </div>
        )}

        {rulesLoading ? (
          <div className="state-container" style={{ padding: '24px 0' }}>
            <div className="loading-spinner" />
          </div>
        ) : merchantRules.length === 0 ? (
          <div className="empty-state-card" style={{ padding: '24px', background: '#fafbfc' }}>
            <p style={{ margin: 0, color: '#637588', fontSize: '13px' }}>
              No custom merchant rules saved yet. When changing a transaction category on the Transactions page, check <em>"Remember for this merchant"</em> to save a preference for future imports.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="merchant-rules-table">
              <thead>
                <tr>
                  <th>Merchant Name</th>
                  <th>Assigned Category</th>
                  <th>Rule Created</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {merchantRules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.merchant_name}</strong>
                    </td>
                    <td>
                      <span className="category-pill">{rule.category}</span>
                    </td>
                    <td className="cell-date">
                      {new Date(rule.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="rule-delete-btn"
                        onClick={() => handleDeleteRule(rule)}
                        disabled={deletingRuleId === rule.merchant_id}
                        title="Remove this merchant categorization rule"
                      >
                        {deletingRuleId === rule.merchant_id ? 'Removing...' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
