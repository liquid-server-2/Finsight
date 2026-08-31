import type { AccountItem, RiskReportResponse, RiskSeverity } from '../types'
import { formatCurrency } from '../utils/formatters'

const DEFAULT_DISCLAIMER =
  'FinSight Risk Engine provides deterministic financial pattern awareness and anomaly detection based solely on imported transaction records. It does not constitute a credit score, solvency guarantee, or professional financial advice.'

interface RiskPageProps {
  riskReport: RiskReportResponse | null
  account: AccountItem | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onNavigateToDashboard: () => void
  onNavigateToAccounts: () => void
  onOpenCsvImport?: () => void
}

function getSeverityBadgeClass(severity: RiskSeverity): string {
  switch (severity) {
    case 'HIGH':
      return 'risk-badge-high'
    case 'MODERATE':
      return 'risk-badge-moderate'
    case 'LOW':
      return 'risk-badge-low'
    default:
      return 'risk-badge-low'
  }
}

function getSeverityIcon(severity: RiskSeverity): string {
  switch (severity) {
    case 'HIGH':
      return '⚠️'
    case 'MODERATE':
      return '🔔'
    case 'LOW':
      return 'ℹ️'
    default:
      return '•'
  }
}

function getOverallLevelLabel(level: string): { label: string; tagClass: string; desc: string } {
  switch (level) {
    case 'LOW':
      return {
        label: 'Low Risk',
        tagClass: 'risk-tag-low',
        desc: 'Spending and cash flow patterns align within stable historical baselines with no critical anomalies detected.',
      }
    case 'MODERATE':
      return {
        label: 'Moderate Risk',
        tagClass: 'risk-tag-moderate',
        desc: 'Notable spending concentrations, month-over-month increases, or single-period cash flow deficits were detected.',
      }
    case 'HIGH':
      return {
        label: 'High Risk',
        tagClass: 'risk-tag-high',
        desc: 'Multiple elevated anomalies detected, such as persistent cash flow deficits, steep spending spikes, or extreme transaction outliers.',
      }
    case 'INSUFFICIENT_DATA':
    default:
      return {
        label: 'Insufficient Data',
        tagClass: 'risk-tag-insufficient',
        desc: 'Not enough transaction history recorded to perform statistical baseline evaluation and anomaly detection.',
      }
  }
}

export function RiskPage({
  riskReport,
  account,
  loading,
  error,
  onRetry,
  onNavigateToDashboard,
  onNavigateToAccounts,
  onOpenCsvImport,
}: RiskPageProps) {
  if (loading) {
    return (
      <div className="state-container">
        <div className="loading-spinner" />
        <p className="eyebrow">Evaluating financial patterns & anomalies...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="state-container">
        <div className="error-banner">
          <h3>Failed to load risk analysis</h3>
          <p>{error}</p>
          <button type="button" className="retry-button" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const currency = riskReport?.currency || account?.currency || 'INR'
  const overallLevel = riskReport?.overall_level || 'INSUFFICIENT_DATA'
  const levelInfo = getOverallLevelLabel(overallLevel)
  const isInsufficient = overallLevel === 'INSUFFICIENT_DATA'

  const score = riskReport?.score
  const metrics = riskReport?.metrics
  const signals = riskReport?.signals || []
  const unavailableSignals = riskReport?.unavailable_signals || []

  const highSignalsCount = signals.filter((s) => s.severity === 'HIGH').length
  const modSignalsCount = signals.filter((s) => s.severity === 'MODERATE').length
  const lowSignalsCount = signals.filter((s) => s.severity === 'LOW').length

  const avgSpendingNum = metrics?.monthly_average_spending
    ? parseFloat(metrics.monthly_average_spending)
    : null
  const netFlowNum = metrics?.net_cash_flow ? parseFloat(metrics.net_cash_flow) : 0

  return (
    <div className="risk-page">
      {/* Topbar */}
      <header className="topbar">
        <div>
          <button
            type="button"
            className="back-button"
            onClick={onNavigateToDashboard}
          >
            ← Back to Dashboard
          </button>
          <h1 style={{ marginTop: '6px' }}>Financial Risk & Anomaly Engine</h1>
          {account && (
            <p className="account-context-eyebrow">
              Account: <strong>{account.name}</strong> ({account.institution || 'Bank'} · {currency})
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

      {isInsufficient ? (
        <section className="panel empty-account-prominent">
          <div className="empty-state-card">
            <div className="empty-state-icon">◈</div>
            <h2>Insufficient Transaction Data</h2>
            <p>
              The Risk Engine requires recorded transaction history to establish statistical baselines for unusual transaction detection, cash flow deficits, and spending spike analysis.
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
          {/* Main Risk Health Summary Banner */}
          <section className="panel risk-hero-banner">
            <div className="risk-hero-left">
              <span className="eyebrow">Financial Risk Posture</span>
              <div className="risk-level-display">
                <span className={`risk-tag-large ${levelInfo.tagClass}`}>
                  {levelInfo.label}
                </span>
                {score !== null && score !== undefined && (
                  <div className="stability-score-pill">
                    <span className="score-num">{score}</span>
                    <span className="score-denom">/ 100</span>
                    <span className="score-label">Stability Index</span>
                  </div>
                )}
              </div>
              <p className="risk-level-description">{levelInfo.desc}</p>
              {riskReport?.score_description && (
                <p className="risk-formula-meta">
                  <small>{riskReport.score_description}</small>
                </p>
              )}
            </div>

            <div className="risk-hero-right">
              <div className="signal-count-summary">
                <div className="signal-count-item high">
                  <span className="count">{highSignalsCount}</span>
                  <span className="label">High Severity</span>
                </div>
                <div className="signal-count-item moderate">
                  <span className="count">{modSignalsCount}</span>
                  <span className="label">Moderate</span>
                </div>
                <div className="signal-count-item low">
                  <span className="count">{lowSignalsCount}</span>
                  <span className="label">Low / Notice</span>
                </div>
              </div>
            </div>
          </section>

          {/* Key Risk & Cash Flow Metrics */}
          <section className="summary-grid" style={{ marginTop: '20px' }}>
            <article className="card">
              <div className="card-top">
                <span className="eyebrow">Monthly Avg Spending</span>
              </div>
              <div className="metric negative">
                {avgSpendingNum !== null
                  ? `-${formatCurrency(avgSpendingNum, currency)}`
                  : 'N/A'}
              </div>
              <div className="card-meta">
                Across {metrics?.months_analyzed || 1} monthly period(s)
              </div>
            </article>

            <article className="card">
              <div className="card-top">
                <span className="eyebrow">Cumulative Net Cash Flow</span>
              </div>
              <div className={`metric ${netFlowNum >= 0 ? 'positive' : 'negative'}`}>
                {netFlowNum >= 0 ? '+' : ''}
                {formatCurrency(netFlowNum, currency)}
              </div>
              <div className="card-meta">
                {netFlowNum >= 0 ? 'Inflow surplus' : 'Net cash deficit'}
              </div>
            </article>

            <article className="card">
              <div className="card-top">
                <span className="eyebrow">Discretionary Spending</span>
              </div>
              <div className="metric">
                {metrics?.discretionary_spending_ratio !== null &&
                metrics?.discretionary_spending_ratio !== undefined
                  ? `${metrics.discretionary_spending_ratio}%`
                  : 'N/A'}
              </div>
              <div className="card-meta">Shopping, Dining, Travel & Entertainment</div>
            </article>

            <article className="card">
              <div className="card-top">
                <span className="eyebrow">Top Category Share</span>
              </div>
              <div className="metric">
                {metrics?.top_category_concentration !== null &&
                metrics?.top_category_concentration !== undefined
                  ? `${metrics.top_category_concentration}%`
                  : 'N/A'}
              </div>
              <div className="card-meta">Dominant category concentration</div>
            </article>
          </section>

          {/* Detected Risk Signals Feed */}
          <section className="panel" style={{ marginTop: '24px' }}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Detected Patterns & Anomalies</p>
                <h2>Active Risk Signals ({signals.length})</h2>
              </div>
            </div>

            {signals.length === 0 ? (
              <div className="empty-signals-banner">
                <div className="empty-signals-icon">✓</div>
                <div>
                  <strong>No active anomalies or elevated risk patterns detected</strong>
                  <p>
                    All debit transactions, monthly spending volumes, and category allocations align within normal statistical baselines.
                  </p>
                </div>
              </div>
            ) : (
              <div className="risk-signals-list">
                {signals.map((signal) => (
                  <article className="risk-signal-card" key={signal.id}>
                    <div className="risk-signal-header">
                      <div className="signal-title-group">
                        <span className="signal-icon">{getSeverityIcon(signal.severity)}</span>
                        <div>
                          <h3 className="signal-title">{signal.title}</h3>
                          <span className="signal-type-tag">{signal.signal_type}</span>
                        </div>
                      </div>
                      <span className={`risk-badge ${getSeverityBadgeClass(signal.severity)}`}>
                        {signal.severity}
                      </span>
                    </div>

                    <p className="risk-signal-message">{signal.message}</p>

                    {signal.evidence && Object.keys(signal.evidence).length > 0 && (
                      <div className="risk-evidence-box">
                        <span className="evidence-header">Supporting Evidence:</span>
                        <div className="evidence-grid">
                          {Object.entries(signal.evidence).map(([key, val]) => {
                            if (key === 'discretionary_categories' && Array.isArray(val)) {
                              return (
                                <div className="evidence-item" key={key}>
                                  <span className="evidence-key">Categories:</span>
                                  <span className="evidence-val">{val.join(', ')}</span>
                                </div>
                              )
                            }
                            return (
                              <div className="evidence-item" key={key}>
                                <span className="evidence-key">
                                  {key.replace(/_/g, ' ')}:
                                </span>
                                <span className="evidence-val">
                                  {typeof val === 'number'
                                    ? val.toLocaleString()
                                    : String(val)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Diagnostic / Inactive Pattern Information */}
          {unavailableSignals.length > 0 && (
            <section className="panel" style={{ marginTop: '24px' }}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Coverage Diagnostics</p>
                  <h2>Signal Activation Thresholds</h2>
                </div>
              </div>
              <ul className="unavailable-signals-list">
                {unavailableSignals.map((item, idx) => (
                  <li key={idx} className="unavailable-signal-item">
                    <span className="info-dot">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Product & Financial Advice Disclaimer */}
          <div className="risk-disclaimer-box" style={{ marginTop: '24px' }}>
            <span className="disclaimer-icon">ℹ</span>
            <p>{riskReport?.disclaimer || DEFAULT_DISCLAIMER}</p>
          </div>
        </>
      )}
    </div>
  )
}
