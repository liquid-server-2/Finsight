import type { AccountItem, AccountSummary, CategorySpending, TransactionItem, UserResponse } from '../types'
import {
  formatAmount,
  formatCurrency,
  formatMerchantName,
  formatTransactionDate,
  getCategoryName,
} from '../utils/formatters'

interface DashboardPageProps {
  currentUser: UserResponse | null
  summary: AccountSummary | null
  transactions: TransactionItem[]
  account: AccountItem | null
  spendingCategories: CategorySpending[]
  onViewAllTransactions: () => void
  onNavigateToAccounts: () => void
  onOpenCsvImport: () => void
}

export function DashboardPage({
  currentUser,
  summary,
  transactions,
  account,
  spendingCategories,
  onViewAllTransactions,
  onNavigateToAccounts,
  onOpenCsvImport,
}: DashboardPageProps) {
  const netCashFlowNum = summary ? parseFloat(summary.net_cash_flow) : 0
  const incomeNum = summary ? parseFloat(summary.total_income) : 0
  const spendingNum = summary ? parseFloat(summary.total_spending) : 0
  const userInitial = currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : 'U'
  const userDisplayName = currentUser?.email ? currentUser.email.split('@')[0] : 'User'

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Financial overview</p>
          <h1>Good morning, {userDisplayName}</h1>
          {account && (
            <p className="account-context-eyebrow">
              Viewing account: <strong>{account.name}</strong> ({account.institution || 'Demo Bank'} · {account.currency})
            </p>
          )}
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="action-pill-btn"
            onClick={onOpenCsvImport}
            title="Import transactions via CSV"
          >
            📄 Import CSV
          </button>
          <button
            type="button"
            className="action-pill-btn"
            onClick={onNavigateToAccounts}
            title="Switch or connect accounts"
          >
            Switch Account
          </button>
          <button
            className="profile-button"
            aria-label="User profile"
            onClick={onNavigateToAccounts}
            title="Manage connected accounts"
          >
            {userInitial}
          </button>
        </div>
      </header>

      <section className="summary-grid">
        <article className="card hero-card">
          <div className="card-top">
            <span className="badge">Net Cash Flow</span>
            <span className="card-meta">
              {account?.name || 'Selected Account'} · {account?.currency || 'INR'}
            </span>
          </div>
          <div className="metric">
            {summary ? formatCurrency(netCashFlowNum, summary.currency) : '₹0.00'}
          </div>
          <div className="card-trend">
            {summary ? `${summary.transaction_count} transactions recorded` : 'No data loaded'}
          </div>
        </article>

        <article className="card">
          <div className="card-top">
            <span className="eyebrow">Income</span>
          </div>
          <div className="metric positive">
            {summary ? `+${formatCurrency(incomeNum, summary.currency)}` : '₹0.00'}
          </div>
          <div className="card-meta">Total inflows</div>
        </article>

        <article className="card">
          <div className="card-top">
            <span className="eyebrow">Spending</span>
          </div>
          <div className="metric negative">
            {summary ? `-${formatCurrency(spendingNum, summary.currency)}` : '₹0.00'}
          </div>
          <div className="card-meta">Total outflows</div>
        </article>

        <article className="card">
          <div className="card-top">
            <span className="eyebrow">Activity</span>
          </div>
          <div className="metric">{summary?.transaction_count ?? 0}</div>
          <div className="card-meta">Imported transactions</div>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Activity</p>
              <h2>Recent transactions</h2>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="action-pill-btn"
                onClick={onOpenCsvImport}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                + Import CSV
              </button>
              <button
                type="button"
                className="text-button"
                onClick={onViewAllTransactions}
              >
                View all
              </button>
            </div>
          </div>

          <div className="transaction-list">
            {transactions.length === 0 ? (
              <div className="empty-state-panel">
                <p>No transactions yet for this account.</p>
                <button
                  type="button"
                  className="primary-btn"
                  style={{ marginTop: '10px', fontSize: '12px', padding: '8px 16px' }}
                  onClick={onOpenCsvImport}
                >
                  📄 Import CSV Statement
                </button>
              </div>
            ) : (
              transactions.slice(0, 5).map((tx) => {
                const amountNum = parseFloat(tx.amount)
                const merchantTitle = formatMerchantName(tx.description)
                const category = getCategoryName(tx)
                const dateFormatted = formatTransactionDate(tx.transaction_date)

                return (
                  <div className="transaction" key={tx.id}>
                    <div className="transaction-icon">
                      {merchantTitle.charAt(0)}
                    </div>

                    <div className="transaction-info">
                      <strong>{merchantTitle}</strong>
                      <span>
                        {category} · {dateFormatted}
                      </span>
                    </div>

                    <span
                      className={
                        amountNum > 0
                          ? 'transaction-amount positive'
                          : 'transaction-amount negative'
                      }
                    >
                      {formatAmount(amountNum)}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Allocation</p>
              <h2>Top spending categories</h2>
            </div>
          </div>

          <div className="category-breakdown">
            {spendingCategories.length === 0 ? (
              <div className="empty-state">No spending data recorded yet.</div>
            ) : (
              spendingCategories.map((item) => (
                <div className="category-row" key={item.category}>
                  <div className="category-row-meta">
                    <strong>{item.category}</strong>
                    <span>
                      {summary ? formatCurrency(item.amount, summary.currency) : `₹${item.amount.toFixed(2)}`} (
                      {item.percentage}%)
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </>
  )
}
