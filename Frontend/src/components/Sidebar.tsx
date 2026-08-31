import type { NavigationPage, UserResponse } from '../types'

interface SidebarProps {
  currentPage: NavigationPage
  onSelectPage: (page: NavigationPage) => void
  currentUser: UserResponse | null
  onLogout: () => void
}

export function Sidebar({
  currentPage,
  onSelectPage,
  currentUser,
  onLogout,
}: SidebarProps) {
  const userInitial = currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : 'U'
  const userDisplayName = currentUser?.email
    ? currentUser.email.split('@')[0]
    : 'User'

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">F</div>
        <span>FinSight</span>
      </div>

      <nav className="navigation">
        <button
          type="button"
          className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectPage('dashboard')}
        >
          <span>⌂</span>
          Dashboard
        </button>

        <button
          type="button"
          className={`nav-item ${currentPage === 'transactions' ? 'active' : ''}`}
          onClick={() => onSelectPage('transactions')}
        >
          <span>↔</span>
          Transactions
        </button>

        <button
          type="button"
          className={`nav-item ${currentPage === 'accounts' ? 'active' : ''}`}
          onClick={() => onSelectPage('accounts')}
        >
          <span>▣</span>
          Accounts
        </button>

        <button
          type="button"
          className={`nav-item ${currentPage === 'insights' ? 'active' : ''}`}
          onClick={() => onSelectPage('insights')}
        >
          <span>✦</span>
          Insights
        </button>

        <button
          type="button"
          className={`nav-item ${currentPage === 'risk' ? 'active' : ''}`}
          onClick={() => onSelectPage('risk')}
        >
          <span>◈</span>
          Risk
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user-info">
          <div className="user-avatar">{userInitial}</div>
          <div className="user-details-text">
            <strong>{userDisplayName}</strong>
            <span title={currentUser?.email}>{currentUser?.email}</span>
          </div>
        </div>

        <button
          type="button"
          className="logout-button"
          onClick={onLogout}
          title="Sign out of FinSight"
          aria-label="Sign out"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
