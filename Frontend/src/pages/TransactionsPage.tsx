import { useMemo, useState } from 'react'
import {
  SUPPORTED_CATEGORIES,
  type AccountItem,
  type SupportedCategory,
  type TransactionItem,
  type TransactionTypeFilter,
} from '../types'
import {
  formatAmount,
  formatMerchantName,
  formatTransactionDate,
  getCategoryName,
} from '../utils/formatters'

interface TransactionsPageProps {
  transactions: TransactionItem[]
  account: AccountItem | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onNavigateToDashboard: () => void
  onNavigateToAccounts?: () => void
  onOpenCsvImport?: () => void
  onTransactionUpdated?: (updatedTx: TransactionItem) => void
  apiBaseUrl?: string
}

export function TransactionsPage({
  transactions,
  account,
  loading,
  error,
  onRetry,
  onNavigateToDashboard,
  onNavigateToAccounts,
  onOpenCsvImport,
  onTransactionUpdated,
  apiBaseUrl = 'http://127.0.0.1:8000',
}: TransactionsPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all')

  // Inline Category Editing state
  const [editingTxId, setEditingTxId] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<SupportedCategory>('Other')
  const [rememberForMerchant, setRememberForMerchant] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const isCredit = tx.transaction_type.toLowerCase() === 'credit' || parseFloat(tx.amount) > 0

      if (typeFilter === 'income' && !isCredit) return false
      if (typeFilter === 'spending' && isCredit) return false

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const desc = (tx.description || '').toLowerCase()
        const merchant = formatMerchantName(tx.description).toLowerCase()
        const cat = getCategoryName(tx).toLowerCase()

        if (!desc.includes(query) && !merchant.includes(query) && !cat.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [transactions, searchQuery, typeFilter])

  const counts = useMemo(() => {
    let incomeCount = 0
    let spendingCount = 0
    transactions.forEach((tx) => {
      const isCredit = tx.transaction_type.toLowerCase() === 'credit' || parseFloat(tx.amount) > 0
      if (isCredit) incomeCount++
      else spendingCount++
    })
    return { all: transactions.length, income: incomeCount, spending: spendingCount }
  }, [transactions])

  const resetFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
  }

  const handleStartEdit = (tx: TransactionItem) => {
    const currentCat = getCategoryName(tx) as SupportedCategory
    setSelectedCategory(
      SUPPORTED_CATEGORIES.includes(currentCat) ? currentCat : 'Other'
    )
    setRememberForMerchant(false)
    setCategoryError(null)
    setEditingTxId(tx.id)
  }

  const handleCancelEdit = () => {
    setEditingTxId(null)
    setCategoryError(null)
    setSavingCategory(false)
  }

  const handleSaveCategory = async (tx: TransactionItem) => {
    setSavingCategory(true)
    setCategoryError(null)

    try {
      // 1. Update Transaction Category
      const res = await fetch(`${apiBaseUrl}/api/transactions/${tx.id}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ category: selectedCategory }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to update category (${res.status})`)
      }

      const updatedTx: TransactionItem = await res.json()

      // 2. Optionally Save Merchant Rule
      if (rememberForMerchant && tx.merchant_id) {
        const ruleRes = await fetch(`${apiBaseUrl}/api/merchant-rules/${tx.merchant_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ category: selectedCategory }),
        })

        if (!ruleRes.ok) {
          // If merchant rule fails, log but don't fail transaction edit
          console.warn('Failed to save merchant rule:', await ruleRes.text())
        }
      }

      if (onTransactionUpdated) {
        onTransactionUpdated(updatedTx)
      }

      setEditingTxId(null)
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to save category.')
    } finally {
      setSavingCategory(false)
    }
  }

  if (loading) {
    return (
      <div className="state-container">
        <div className="loading-spinner" />
        <p className="eyebrow">Loading account transactions...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="state-container">
        <div className="error-banner">
          <h3>Failed to load transactions</h3>
          <p>{error}</p>
          <button type="button" className="retry-button" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="transactions-page">
      {/* Header */}
      <header className="topbar">
        <div>
          <button
            type="button"
            className="back-button"
            onClick={onNavigateToDashboard}
          >
            ← Back to Dashboard
          </button>
          <h1 style={{ marginTop: '6px' }}>Transactions History</h1>
          {account && (
            <p className="account-context-eyebrow">
              Active account: <strong>{account.name}</strong> ({account.institution || 'Demo Bank'} · {account.currency})
            </p>
          )}
        </div>

        <div className="topbar-actions">
          {onOpenCsvImport && (
            <button
              type="button"
              className="action-pill-btn primary-pill"
              onClick={onOpenCsvImport}
              title="Import CSV transactions for this account"
            >
              📄 Import CSV
            </button>
          )}
          {onNavigateToAccounts && (
            <button
              type="button"
              className="action-pill-btn"
              onClick={onNavigateToAccounts}
              title="Switch active account"
            >
              Switch Account
            </button>
          )}
          <div className="page-meta-badge">
            {transactions.length} Total
          </div>
        </div>
      </header>

      {/* Search & Filter Toolbar */}
      <section className="transactions-toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by merchant, description, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-group">
          <button
            type="button"
            className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            className={`filter-btn ${typeFilter === 'income' ? 'active' : ''}`}
            onClick={() => setTypeFilter('income')}
          >
            Income ({counts.income})
          </button>
          <button
            type="button"
            className={`filter-btn ${typeFilter === 'spending' ? 'active' : ''}`}
            onClick={() => setTypeFilter('spending')}
          >
            Spending ({counts.spending})
          </button>
        </div>
      </section>

      {/* Results Header */}
      <div className="results-summary-row">
        <span>
          Showing <strong>{filteredTransactions.length}</strong> of{' '}
          <strong>{transactions.length}</strong> transactions
        </span>
        {(searchQuery || typeFilter !== 'all') && (
          <button
            type="button"
            className="clear-filters-link"
            onClick={resetFilters}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Transactions Table / List */}
      <section className="panel transactions-panel">
        {transactions.length === 0 ? (
          <div className="empty-state-card" style={{ padding: '36px 20px' }}>
            <div className="empty-state-icon">📄</div>
            <h3>No transactions recorded yet</h3>
            <p style={{ color: '#718198', maxWidth: '400px', margin: '8px auto 16px' }}>
              This account does not have any transactions yet. Import a CSV statement to populate your cash flow data.
            </p>
            {onOpenCsvImport && (
              <button
                type="button"
                className="primary-btn"
                onClick={onOpenCsvImport}
              >
                📄 Import CSV Statement
              </button>
            )}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <p>No transactions found matching your criteria.</p>
            <button
              type="button"
              className="retry-button"
              onClick={resetFilters}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Merchant / Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Currency</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => {
                  const amountNum = parseFloat(tx.amount)
                  const isCredit = tx.transaction_type.toLowerCase() === 'credit' || amountNum > 0
                  const merchantTitle = formatMerchantName(tx.description)
                  const category = getCategoryName(tx)
                  const dateFormatted = formatTransactionDate(tx.transaction_date)
                  const isEditing = editingTxId === tx.id

                  return (
                    <tr key={tx.id} className={`transaction-row ${isEditing ? 'row-editing' : ''}`}>
                      <td className="cell-merchant">
                        <div className="merchant-cell-content">
                          <div className="transaction-icon">
                            {merchantTitle.charAt(0)}
                          </div>
                          <div>
                            <strong>{merchantTitle}</strong>
                            {tx.description && tx.description !== merchantTitle && (
                              <span className="raw-description">{tx.description}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="cell-category">
                        {isEditing ? (
                          <div className="inline-category-editor" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={selectedCategory}
                              onChange={(e) => setSelectedCategory(e.target.value as SupportedCategory)}
                              className="category-dropdown"
                              disabled={savingCategory}
                            >
                              {SUPPORTED_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>

                            {tx.merchant_id && (
                              <label className="remember-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={rememberForMerchant}
                                  onChange={(e) => setRememberForMerchant(e.target.checked)}
                                  disabled={savingCategory}
                                />
                                <span>Remember for {merchantTitle}</span>
                              </label>
                            )}

                            {categoryError && (
                              <span className="inline-edit-error">{categoryError}</span>
                            )}

                            <div className="inline-edit-actions">
                              <button
                                type="button"
                                className="save-pill-btn"
                                onClick={() => handleSaveCategory(tx)}
                                disabled={savingCategory}
                              >
                                {savingCategory ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                className="cancel-pill-btn"
                                onClick={handleCancelEdit}
                                disabled={savingCategory}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="category-pill-btn"
                            onClick={() => handleStartEdit(tx)}
                            title="Click to change category or set merchant rule"
                          >
                            <span className="category-pill">{category}</span>
                            <span className="edit-pill-icon">✎</span>
                          </button>
                        )}
                      </td>
                      <td className="cell-date">{dateFormatted}</td>
                      <td>
                        <span
                          className={`type-badge ${isCredit ? 'credit-badge' : 'debit-badge'}`}
                        >
                          {isCredit ? 'Credit / Income' : 'Debit / Expense'}
                        </span>
                      </td>
                      <td className="cell-currency">{tx.currency}</td>
                      <td className="cell-amount" style={{ textAlign: 'right' }}>
                        <span
                          className={
                            isCredit
                              ? 'transaction-amount positive'
                              : 'transaction-amount negative'
                          }
                        >
                          {formatAmount(amountNum, tx.currency)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
