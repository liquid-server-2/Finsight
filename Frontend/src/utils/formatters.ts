import type { TransactionItem } from '../types'

export function formatAmount(amountStr: string | number, currency: string = 'INR'): string {
  const amount = typeof amountStr === 'string' ? parseFloat(amountStr) : amountStr
  const symbol =
    currency.toUpperCase() === 'USD'
      ? '$'
      : currency.toUpperCase() === 'EUR'
        ? '€'
        : currency.toUpperCase() === 'GBP'
          ? '£'
          : '₹'
  const locale = currency.toUpperCase() === 'INR' ? 'en-IN' : 'en-US'
  return `${amount < 0 ? '-' : '+'}${symbol}${Math.abs(amount).toLocaleString(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

export function formatCurrency(amountStr: string | number, currency: string = 'INR'): string {
  const amount = typeof amountStr === 'string' ? parseFloat(amountStr) : amountStr
  const symbol =
    currency.toUpperCase() === 'USD'
      ? '$'
      : currency.toUpperCase() === 'EUR'
        ? '€'
        : currency.toUpperCase() === 'GBP'
          ? '£'
          : '₹'
  const locale = currency.toUpperCase() === 'INR' ? 'en-IN' : 'en-US'
  return `${symbol}${Math.abs(amount).toLocaleString(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}`
}

export function formatTransactionDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMerchantName(description: string | null): string {
  if (!description) return 'Unknown Merchant'
  return description
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function getCategoryName(tx: TransactionItem): string {
  if (tx.category && tx.category.trim()) {
    return tx.category.trim()
  }
  return 'Other'
}
