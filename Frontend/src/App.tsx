import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { CreateAccountModal } from './components/CreateAccountModal'
import { CsvImportModal } from './components/CsvImportModal'
import { Sidebar } from './components/Sidebar'
import { AccountsPage } from './pages/AccountsPage'
import { DashboardPage } from './pages/DashboardPage'
import { InsightsPage } from './pages/InsightsPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { RiskPage } from './pages/RiskPage'
import { TransactionsPage } from './pages/TransactionsPage'
import type {
  AccountAnalytics,
  AccountItem,
  AccountSummary,
  AuthView,
  CategorySpending,
  NavigationPage,
  RiskReportResponse,
  TransactionItem,
  UserResponse,
} from './types'

const PRODUCTION_BACKEND_URL = 'https://finsight-backend-tlsn.onrender.com'

const API_BASE_URL = (() => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location.hostname) {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.endsWith('.local')
    return isLocal
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : PRODUCTION_BACKEND_URL
  }
  return import.meta.env.PROD ? PRODUCTION_BACKEND_URL : 'http://127.0.0.1:8000'
})()

function App() {
  const [authChecking, setAuthChecking] = useState(true)
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null)
  const [authView, setAuthView] = useState<AuthView>('login')

  const [currentPage, setCurrentPage] = useState<NavigationPage>('dashboard')
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [summary, setSummary] = useState<AccountSummary | null>(null)
  const [analytics, setAnalytics] = useState<AccountAnalytics | null>(null)
  const [riskReport, setRiskReport] = useState<RiskReportResponse | null>(null)
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false)
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false)
  const [importTargetAccount, setImportTargetAccount] = useState<AccountItem | null>(null)

  // 1. Check existing session on mount
  useEffect(() => {
    let ignore = false

    const checkSession = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          credentials: 'include',
        })
        if (res.ok) {
          const user: UserResponse = await res.json()
          if (!ignore) {
            setCurrentUser(user)
          }
        } else {
          if (!ignore) {
            setCurrentUser(null)
          }
        }
      } catch {
        if (!ignore) {
          setCurrentUser(null)
        }
      } finally {
        if (!ignore) {
          setAuthChecking(false)
        }
      }
    }

    checkSession()

    return () => {
      ignore = true
    }
  }, [])

  // 2. Load accounts for the authenticated user
  const fetchAccounts = useCallback(async () => {
    if (!currentUser) return
    try {
      setAccountsLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/accounts`, {
        credentials: 'include',
      })
      if (!res.ok) {
        if (res.status === 401) {
          setCurrentUser(null)
          return
        }
        throw new Error(`Failed to load accounts (${res.status})`)
      }
      const data: AccountItem[] = await res.json()
      setAccounts(data)
      if (data.length > 0) {
        setSelectedAccountId((prev) =>
          prev !== null && data.some((a) => a.id === prev) ? prev : data[0].id
        )
      } else {
        setSelectedAccountId(null)
        setSummary(null)
        setAnalytics(null)
        setRiskReport(null)
        setTransactions([])
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch accounts.')
    } finally {
      setAccountsLoading(false)
    }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    let ignore = false

    const loadAccounts = async () => {
      try {
        setAccountsLoading(true)
        const res = await fetch(`${API_BASE_URL}/api/accounts`, {
          credentials: 'include',
        })
        if (!res.ok) {
          if (res.status === 401) {
            if (!ignore) setCurrentUser(null)
            return
          }
          throw new Error(`Failed to load accounts (${res.status})`)
        }
        const data: AccountItem[] = await res.json()
        if (!ignore) {
          setAccounts(data)
          if (data.length > 0) {
            setSelectedAccountId((prev) =>
              prev !== null && data.some((a) => a.id === prev) ? prev : data[0].id
            )
          } else {
            setSelectedAccountId(null)
            setSummary(null)
            setAnalytics(null)
            setRiskReport(null)
            setTransactions([])
          }
          setError(null)
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to fetch accounts.')
        }
      } finally {
        if (!ignore) {
          setAccountsLoading(false)
        }
      }
    }

    loadAccounts()

    return () => {
      ignore = true
    }
  }, [currentUser])

  // 3. Load summary, transactions, analytics, and risk for the selected account
  const fetchAccountData = useCallback(async (accountId: number) => {
    try {
      setDataLoading(true)
      const [summaryRes, transactionsRes, analyticsRes, riskRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/accounts/${accountId}/summary`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE_URL}/api/accounts/${accountId}/transactions?limit=50`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE_URL}/api/accounts/${accountId}/analytics`, {
          credentials: 'include',
        }),
        fetch(`${API_BASE_URL}/api/accounts/${accountId}/risk`, {
          credentials: 'include',
        }),
      ])

      if (!summaryRes.ok) {
        if (summaryRes.status === 401) {
          setCurrentUser(null)
          return
        }
        throw new Error(`Failed to load account summary (${summaryRes.status})`)
      }
      if (!transactionsRes.ok) {
        if (transactionsRes.status === 401) {
          setCurrentUser(null)
          return
        }
        throw new Error(`Failed to load transactions (${transactionsRes.status})`)
      }
      if (!analyticsRes.ok) {
        if (analyticsRes.status === 401) {
          setCurrentUser(null)
          return
        }
        throw new Error(`Failed to load analytics (${analyticsRes.status})`)
      }
      if (!riskRes.ok) {
        if (riskRes.status === 401) {
          setCurrentUser(null)
          return
        }
        throw new Error(`Failed to load risk analysis (${riskRes.status})`)
      }

      const summaryData: AccountSummary = await summaryRes.json()
      const transactionsData: TransactionItem[] = await transactionsRes.json()
      const analyticsData: AccountAnalytics = await analyticsRes.json()
      const riskData: RiskReportResponse = await riskRes.json()

      setSummary(summaryData)
      setTransactions(transactionsData)
      setAnalytics(analyticsData)
      setRiskReport(riskData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch account data.')
    } finally {
      setDataLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!currentUser || selectedAccountId === null) return

    let ignore = false

    const loadData = async () => {
      try {
        setDataLoading(true)
        const [summaryRes, transactionsRes, analyticsRes, riskRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/accounts/${selectedAccountId}/summary`, {
            credentials: 'include',
          }),
          fetch(`${API_BASE_URL}/api/accounts/${selectedAccountId}/transactions?limit=50`, {
            credentials: 'include',
          }),
          fetch(`${API_BASE_URL}/api/accounts/${selectedAccountId}/analytics`, {
            credentials: 'include',
          }),
          fetch(`${API_BASE_URL}/api/accounts/${selectedAccountId}/risk`, {
            credentials: 'include',
          }),
        ])

        if (!summaryRes.ok) {
          if (summaryRes.status === 401) {
            if (!ignore) setCurrentUser(null)
            return
          }
          throw new Error(`Failed to load account summary (${summaryRes.status})`)
        }
        if (!transactionsRes.ok) {
          if (transactionsRes.status === 401) {
            if (!ignore) setCurrentUser(null)
            return
          }
          throw new Error(`Failed to load transactions (${transactionsRes.status})`)
        }
        if (!analyticsRes.ok) {
          if (analyticsRes.status === 401) {
            if (!ignore) setCurrentUser(null)
            return
          }
          throw new Error(`Failed to load analytics (${analyticsRes.status})`)
        }
        if (!riskRes.ok) {
          if (riskRes.status === 401) {
            if (!ignore) setCurrentUser(null)
            return
          }
          throw new Error(`Failed to load risk analysis (${riskRes.status})`)
        }

        const summaryData: AccountSummary = await summaryRes.json()
        const transactionsData: TransactionItem[] = await transactionsRes.json()
        const analyticsData: AccountAnalytics = await analyticsRes.json()
        const riskData: RiskReportResponse = await riskRes.json()

        if (!ignore) {
          setSummary(summaryData)
          setTransactions(transactionsData)
          setAnalytics(analyticsData)
          setRiskReport(riskData)
          setError(null)
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to fetch account data.')
        }
      } finally {
        if (!ignore) {
          setDataLoading(false)
        }
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [currentUser, selectedAccountId])

  const selectedAccount = useMemo<AccountItem | null>(() => {
    if (selectedAccountId === null) return null
    return accounts.find((a) => a.id === selectedAccountId) || null
  }, [accounts, selectedAccountId])

  const handleSelectAccount = (accountId: number) => {
    setSelectedAccountId(accountId)
  }

  // Account creation handler
  const handleAccountCreated = (newAccount: AccountItem) => {
    setAccounts((prev) => [...prev, newAccount])
    setSelectedAccountId(newAccount.id)
    setIsCreateAccountOpen(false)
    fetchAccountData(newAccount.id)
  }

  // CSV Import opener
  const handleOpenCsvImport = (account?: AccountItem) => {
    const target = account || selectedAccount
    if (target) {
      setImportTargetAccount(target)
      setIsCsvImportOpen(true)
    } else {
      setIsCreateAccountOpen(true)
    }
  }

  // CSV Import success handler
  const handleImportSuccess = () => {
    if (selectedAccountId !== null) {
      fetchAccountData(selectedAccountId)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Proceed with clearing local state
    } finally {
      setCurrentUser(null)
      setAccounts([])
      setSelectedAccountId(null)
      setSummary(null)
      setAnalytics(null)
      setRiskReport(null)
      setTransactions([])
      setCurrentPage('dashboard')
      setAuthView('login')
    }
  }

  const handleRetry = () => {
    if (accounts.length === 0) {
      fetchAccounts()
    } else if (selectedAccountId !== null) {
      fetchAccountData(selectedAccountId)
    }
  }

  const handleAuthSuccess = (user: UserResponse) => {
    setCurrentUser(user)
    setCurrentPage('dashboard')
  }

  const handleTransactionUpdated = (updatedTx: TransactionItem) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === updatedTx.id ? updatedTx : tx))
    )
    if (selectedAccountId !== null) {
      // Refresh summary, analytics & risk in background to keep graphs and signals updated
      fetch(`${API_BASE_URL}/api/accounts/${selectedAccountId}/summary`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setSummary(data))
        .catch(() => {})

      fetch(`${API_BASE_URL}/api/accounts/${selectedAccountId}/analytics`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setAnalytics(data))
        .catch(() => {})

      fetch(`${API_BASE_URL}/api/accounts/${selectedAccountId}/risk`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setRiskReport(data))
        .catch(() => {})
    }
  }

  // Dashboard spending categories powered directly by backend analytics breakdown
  const spendingCategories = useMemo<CategorySpending[]>(() => {
    if (!analytics || !analytics.spending_by_category) return []
    return analytics.spending_by_category.map((item) => ({
      category: item.category,
      amount: parseFloat(item.amount),
      percentage: Math.round(item.percentage),
    }))
  }, [analytics])

  // Initial Auth Verification screen
  if (authChecking) {
    return (
      <div className="state-container" style={{ minHeight: '100vh' }}>
        <div className="loading-spinner" />
        <p className="eyebrow">Checking FinSight session...</p>
      </div>
    )
  }

  // Unauthenticated: Show Login / Register view
  if (!currentUser) {
    if (authView === 'register') {
      return (
        <RegisterPage
          apiBaseUrl={API_BASE_URL}
          onRegisterSuccess={handleAuthSuccess}
          onNavigateToLogin={() => setAuthView('login')}
        />
      )
    }

    return (
      <LoginPage
        apiBaseUrl={API_BASE_URL}
        onLoginSuccess={handleAuthSuccess}
        onNavigateToRegister={() => setAuthView('register')}
      />
    )
  }

  // Authenticated App Shell
  const isInitialLoading = accountsLoading || (dataLoading && summary === null)

  return (
    <div className="dashboard">
      <Sidebar
        currentPage={currentPage}
        onSelectPage={(page) => setCurrentPage(page)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {currentPage === 'accounts' ? (
          <AccountsPage
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={handleSelectAccount}
            onOpenCreateAccount={() => setIsCreateAccountOpen(true)}
            onOpenCsvImport={handleOpenCsvImport}
            loading={accountsLoading}
            error={error}
            onRetry={fetchAccounts}
            onNavigateToDashboard={() => setCurrentPage('dashboard')}
            apiBaseUrl={API_BASE_URL}
          />
        ) : currentPage === 'transactions' ? (
          <TransactionsPage
            transactions={transactions}
            account={selectedAccount}
            loading={dataLoading}
            error={error}
            onRetry={handleRetry}
            onNavigateToDashboard={() => setCurrentPage('dashboard')}
            onNavigateToAccounts={() => setCurrentPage('accounts')}
            onOpenCsvImport={() => handleOpenCsvImport(selectedAccount || undefined)}
            onTransactionUpdated={handleTransactionUpdated}
            apiBaseUrl={API_BASE_URL}
          />
        ) : currentPage === 'insights' ? (
          <InsightsPage
            analytics={analytics}
            account={selectedAccount}
            loading={dataLoading}
            error={error}
            onRetry={handleRetry}
            onNavigateToDashboard={() => setCurrentPage('dashboard')}
            onNavigateToAccounts={() => setCurrentPage('accounts')}
            onOpenCsvImport={() => handleOpenCsvImport(selectedAccount || undefined)}
          />
        ) : currentPage === 'risk' ? (
          <RiskPage
            riskReport={riskReport}
            account={selectedAccount}
            loading={dataLoading}
            error={error}
            onRetry={handleRetry}
            onNavigateToDashboard={() => setCurrentPage('dashboard')}
            onNavigateToAccounts={() => setCurrentPage('accounts')}
            onOpenCsvImport={() => handleOpenCsvImport(selectedAccount || undefined)}
          />
        ) : currentPage === 'dashboard' ? (
          isInitialLoading ? (
            <div className="state-container">
              <div className="loading-spinner" />
              <p className="eyebrow">Loading your financial overview...</p>
            </div>
          ) : error && summary === null ? (
            <div className="state-container">
              <div className="error-banner">
                <h3>Unable to connect to FinSight backend</h3>
                <p>{error}</p>
                <button type="button" className="retry-button" onClick={handleRetry}>
                  Try Again
                </button>
              </div>
            </div>
          ) : accounts.length === 0 ? (
            <div className="state-container">
              <div className="empty-state-card" style={{ maxWidth: '440px' }}>
                <div className="empty-state-icon">🏦</div>
                <h2>Connect your first account</h2>
                <p style={{ color: '#718198', margin: '8px 0 20px' }}>
                  To start visualizing income, spending, and cash flow trends, connect your first bank or savings account.
                </p>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setIsCreateAccountOpen(true)}
                >
                  + Connect Account
                </button>
              </div>
            </div>
          ) : (
            <DashboardPage
              currentUser={currentUser}
              summary={summary}
              transactions={transactions}
              account={selectedAccount}
              spendingCategories={spendingCategories}
              onViewAllTransactions={() => setCurrentPage('transactions')}
              onNavigateToAccounts={() => setCurrentPage('accounts')}
              onOpenCsvImport={() => handleOpenCsvImport(selectedAccount || undefined)}
            />
          )
        ) : (
          <div className="state-container">
            <h2>{String(currentPage).charAt(0).toUpperCase() + String(currentPage).slice(1)} View</h2>
            <p className="card-meta">This section is coming in a future milestone.</p>
            <button
              type="button"
              className="retry-button"
              onClick={() => setCurrentPage('dashboard')}
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </main>

      {/* Account Creation Modal */}
      <CreateAccountModal
        isOpen={isCreateAccountOpen}
        onClose={() => setIsCreateAccountOpen(false)}
        onAccountCreated={handleAccountCreated}
        apiBaseUrl={API_BASE_URL}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvImportOpen}
        onClose={() => setIsCsvImportOpen(false)}
        account={importTargetAccount || selectedAccount}
        apiBaseUrl={API_BASE_URL}
        onImportSuccess={handleImportSuccess}
      />
    </div>
  )
}

export default App