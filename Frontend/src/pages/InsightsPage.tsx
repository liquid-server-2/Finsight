import type { AccountAnalytics, AccountItem } from '../types'
import { formatAmount, formatCurrency } from '../utils/formatters'

interface InsightsPageProps {
  analytics: AccountAnalytics | null
  account: AccountItem | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onNavigateToDashboard: () => void
  onNavigateToAccounts: () => void
  onOpenCsvImport?: () => void
}

function formatMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
  if (isNaN(date.getTime())) return monthStr
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function InsightsPage({
  analytics,
  account,
  loading,
  error,
  onRetry,
  onNavigateToDashboard,
  onNavigateToAccounts,
  onOpenCsvImport,
}: InsightsPageProps) {
  if (loading) {
    return (
      <div className="state-container">
        <div className="loading-spinner" />
        <p className="eyebrow">Generating financial insights...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="state-container">
        <div className="error-banner">
          <h3>Failed to load financial analytics</h3>
          <p>{error}</p>
          <button type="button" className="retry-button" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const currency = analytics?.currency || account?.currency || 'INR'
  const incomeNum = analytics ? parseFloat(analytics.total_income) : 0
  const spendingNum = analytics ? parseFloat(analytics.total_spending) : 0
  const netNum = analytics ? parseFloat(analytics.net_cash_flow) : 0
  const avgNum = analytics ? parseFloat(analytics.average_transaction_amount) : 0
  const count = analytics?.transaction_count ?? 0

  const hasTransactions = count > 0
  const spendingCategories = analytics?.spending_by_category || []
  const incomeCategories = analytics?.income_by_category || []
  const monthlyTrend = analytics?.monthly_trend || []

  // Max value for monthly chart scaling
  const maxMonthlyVolume = monthlyTrend.reduce((max, item) => {
    const inc = parseFloat(item.income)
    const sp = parseFloat(item.spending)
    return Math.max(max, inc, sp)
  }, 1)

  return (
    <div className="insights-page">
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
          <h1 style={{ marginTop: '6px' }}>Financial Insights</h1>
          {account && (
            <p className="account-context-eyebrow">
              Analytics for: <strong>{account.name}</strong> ({account.institution || 'Demo Bank'} · {currency})
            </p>
          )}
        </div>

        <div className="topbar-actions">
          {onOpenCsvImport && (
            <button
              type="button"
              className="action-pill-btn primary-pill"
              onClick={onOpenCsvImport}
              title="Import CSV statement"
            >
              📄 Import CSV
            </button>
          )}
          <button
            type="button"
            className="action-pill-btn"
            onClick={onNavigateToAccounts}
            title="Switch active account"
          >
            Switch Account
          </button>
        </div>
      </header>

      {!hasTransactions ? (
        <section className="panel empty-account-prominent">
          <div className="empty-state-card">
            <div className="empty-state-icon">✦</div>
            <h2>No analytics available yet</h2>
            <p>
              This account has no transactions recorded. Upload a CSV statement to unlock category breakdowns, monthly cash flow trends, and spending analytics.
            </p>
            {onOpenCsvImport && (
              <button
                type="button"
                className="primary-btn"
                style={{ marginTop: '18px' }}
                onClick={onOpenCsvImport}
              >
                📄 Import CSV Statement
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* KPI Analytics Cards */}
          <section className="summary-grid">
            <article className="card hero-card">
              <div className="card-top">
                <span className="badge">Net Cash Flow</span>
                <span className="card-meta">{count} Transactions</span>
              </div>
              <div className="metric">{formatCurrency(netNum, currency)}</div>
              <div className="card-trend">
                {netNum >= 0 ? 'Surplus cash position' : 'Deficit cash position'}
              </div>
            </article>

            <article className="card">
              <div className="card-top">
                <span className="eyebrow">Total Income</span>
              </div>
              <div className="metric positive">
                +{formatCurrency(incomeNum, currency)}
              </div>
              <div className="card-meta">Total credited inflows</div>
            </article>

            <article className="card">
              <div className="card-top">
                <span className="eyebrow">Total Spending</span>
              </div>
              <div className="metric negative">
                -{formatCurrency(spendingNum, currency)}
              </div>
              <div className="card-meta">Total debited outflows</div>
            </article>

            <article className="card">
              <div className="card-top">
                <span className="eyebrow">Avg Transaction</span>
              </div>
              <div className="metric">{formatCurrency(avgNum, currency)}</div>
              <div className="card-meta">Mean volume per transaction</div>
            </article>
          </section>

          {/* Top Category Callout */}
          {analytics?.top_spending_category && (
            <div className="top-category-callout">
              <div className="callout-icon">💡</div>
              <div className="callout-content">
                <strong>Primary Spending Focus: {analytics.top_spending_category}</strong>
                <span>
                  You spent{' '}
                  <strong>
                    {formatCurrency(
                      parseFloat(analytics.top_spending_category_amount || '0'),
                      currency
                    )}
                  </strong>{' '}
                  in {analytics.top_spending_category}
                  {spendingNum > 0 &&
                    ` (${(
                      (parseFloat(analytics.top_spending_category_amount || '0') /
                        spendingNum) *
                      100
                    ).toFixed(1)}% of total expenses)`}
                  .
                </span>
              </div>
            </div>
          )}

          {/* Main Visuals Grid */}
          <section className="content-grid" style={{ marginTop: '24px' }}>
            {/* Category Spending Breakdown */}
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Spending Distribution</p>
                  <h2>Expenses by Category</h2>
                </div>
                <span className="page-meta-badge">
                  {spendingCategories.length} Categories
                </span>
              </div>

              {spendingCategories.length === 0 ? (
                <div className="empty-state-panel">
                  <p>No debit transactions recorded for this account.</p>
                </div>
              ) : (
                <div className="category-breakdown-list">
                  {spendingCategories.map((item) => {
                    const amountVal = parseFloat(item.amount)

                    return (
                      <div className="insight-category-row" key={item.category}>
                        <div className="insight-category-header">
                          <div className="category-info-left">
                            <span className="category-badge-dot" />
                            <strong>{item.category}</strong>
                          </div>
                          <div className="category-info-right">
                            <strong className="negative">
                              -{formatCurrency(amountVal, currency)}
                            </strong>
                            <span className="percentage-badge">
                              {item.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min(Math.max(item.percentage, 2), 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </article>

            {/* Monthly Trend Panel */}
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Timeline Analysis</p>
                  <h2>Monthly Cash Flow</h2>
                </div>
                <span className="page-meta-badge">
                  {monthlyTrend.length} {monthlyTrend.length === 1 ? 'Month' : 'Months'}
                </span>
              </div>

              {monthlyTrend.length === 0 ? (
                <div className="empty-state-panel">
                  <p>No monthly timeline data recorded.</p>
                </div>
              ) : (
                <div className="monthly-trend-container">
                  {/* CSS-based Bar Chart */}
                  <div className="monthly-chart">
                    {monthlyTrend.map((m) => {
                      const incVal = parseFloat(m.income)
                      const spVal = parseFloat(m.spending)
                      const incHeight = Math.max((incVal / maxMonthlyVolume) * 100, 4)
                      const spHeight = Math.max((spVal / maxMonthlyVolume) * 100, 4)

                      return (
                        <div className="chart-month-column" key={m.month}>
                          <div className="chart-bars-wrapper">
                            <div
                              className="chart-bar income-bar"
                              style={{ height: `${incHeight}%` }}
                              title={`Income: +${formatCurrency(incVal, currency)}`}
                            />
                            <div
                              className="chart-bar spending-bar"
                              style={{ height: `${spHeight}%` }}
                              title={`Spending: -${formatCurrency(spVal, currency)}`}
                            />
                          </div>
                          <span className="chart-month-label">
                            {formatMonthLabel(m.month)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="chart-legend">
                    <div className="legend-item">
                      <span className="legend-dot income" />
                      <span>Income</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-dot spending" />
                      <span>Spending</span>
                    </div>
                  </div>

                  {/* Monthly Summary Table */}
                  <div className="monthly-table-wrapper">
                    <table className="monthly-summary-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th style={{ textAlign: 'right' }}>Income</th>
                          <th style={{ textAlign: 'right' }}>Spending</th>
                          <th style={{ textAlign: 'right' }}>Net Flow</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyTrend.map((m) => {
                          const netVal = parseFloat(m.net_cash_flow)
                          return (
                            <tr key={m.month}>
                              <td>
                                <strong>{formatMonthLabel(m.month)}</strong>
                              </td>
                              <td style={{ textAlign: 'right' }} className="positive">
                                +{formatCurrency(parseFloat(m.income), currency)}
                              </td>
                              <td style={{ textAlign: 'right' }} className="negative">
                                -{formatCurrency(parseFloat(m.spending), currency)}
                              </td>
                              <td
                                style={{ textAlign: 'right' }}
                                className={netVal >= 0 ? 'positive' : 'negative'}
                              >
                                {formatAmount(netVal, currency)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </article>
          </section>

          {/* Income Categories (if multiple sources exist) */}
          {incomeCategories.length > 0 && (
            <section className="panel" style={{ marginTop: '24px' }}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Inflow Distribution</p>
                  <h2>Income by Category</h2>
                </div>
              </div>

              <div className="income-sources-grid">
                {incomeCategories.map((item) => (
                  <div className="income-source-card" key={item.category}>
                    <span className="eyebrow">{item.category}</span>
                    <div className="metric positive" style={{ fontSize: '20px' }}>
                      +{formatCurrency(parseFloat(item.amount), currency)}
                    </div>
                    <span className="card-meta">
                      {item.percentage.toFixed(1)}% of total inflows
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
