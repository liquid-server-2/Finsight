export interface CategoryBreakdownItem {
  category: string
  amount: string
  percentage: number
}

export interface MonthlyTrendItem {
  month: string
  income: string
  spending: string
  net_cash_flow: string
}

export interface AccountAnalytics {
  account_id: number
  currency: string
  total_income: string
  total_spending: string
  net_cash_flow: string
  transaction_count: number
  average_transaction_amount: string
  top_spending_category: string | null
  top_spending_category_amount: string | null
  spending_by_category: CategoryBreakdownItem[]
  income_by_category: CategoryBreakdownItem[]
  monthly_trend: MonthlyTrendItem[]
}

export interface AccountSummary {
  account_id: number
  currency: string
  total_income: string
  total_spending: string
  net_cash_flow: string
  transaction_count: number
}

export interface TransactionItem {
  id: number
  account_id: number
  merchant_id: number | null
  amount: string
  currency: string
  transaction_date: string
  description: string | null
  category: string | null
  transaction_type: string
  is_recurring: boolean
  created_at: string
}

export interface AccountItem {
  id: number
  user_id: number
  name: string
  account_type: string
  institution: string | null
  currency: string
  created_at: string
}

export interface CategorySpending {
  category: string
  amount: number
  percentage: number
}

export interface UserResponse {
  id: number
  email: string
  created_at: string
}

export interface MerchantRuleItem {
  id: number
  user_id: number
  merchant_id: number
  merchant_name: string
  category: string
  created_at: string
  updated_at: string
}

export const SUPPORTED_CATEGORIES = [
  'Income',
  'Food & Dining',
  'Transportation',
  'Entertainment',
  'Shopping',
  'Bills & Utilities',
  'Healthcare',
  'Travel',
  'Transfer',
  'Other',
] as const

export type SupportedCategory = (typeof SUPPORTED_CATEGORIES)[number]

export type NavigationPage = 'dashboard' | 'transactions' | 'accounts' | 'insights' | 'risk'

export type TransactionTypeFilter = 'all' | 'income' | 'spending'

export type AuthView = 'login' | 'register'

export type RiskSeverity = 'LOW' | 'MODERATE' | 'HIGH'
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'INSUFFICIENT_DATA'

export interface RiskSignal {
  id: string
  signal_type: string
  severity: RiskSeverity
  title: string
  message: string
  evidence: Record<string, unknown>
  transaction_id: number | null
}

export interface RiskMetrics {
  total_income: string
  total_spending: string
  net_cash_flow: string
  monthly_average_spending: string | null
  monthly_average_income: string | null
  discretionary_spending_ratio: number | null
  top_category_concentration: number | null
  months_analyzed: number
  total_transactions_analyzed: number
}

export interface RiskReportResponse {
  account_id: number
  currency: string
  overall_level: RiskLevel
  score: number | null
  score_description: string | null
  metrics: RiskMetrics
  signals: RiskSignal[]
  unavailable_signals: string[]
  disclaimer: string
  generated_at: string
}

