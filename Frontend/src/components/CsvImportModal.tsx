import { useRef, useState } from 'react'
import type { AccountItem } from '../types'

interface CsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  account: AccountItem | null
  apiBaseUrl: string
  onImportSuccess: (importedCount: number) => void
}

interface RowError {
  row: number
  reason: string
}

export function CsvImportModal({
  isOpen,
  onClose,
  account,
  apiBaseUrl,
  onImportSuccess,
}: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [successCount, setSuccessCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0]
      const name = selected.name.toLowerCase()
      const isCsv = name.endsWith('.csv')
      const isXls = name.endsWith('.xls')

      if (!isCsv && !isXls) {
        setGeneralError(
          'Please select a supported file format: CSV (.csv) or HDFC Bank Excel (.xls) statement.'
        )
        setFile(null)
        return
      }
      setFile(selected)
      setGeneralError(null)
      setRowErrors([])
      setSuccessCount(null)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account) {
      setGeneralError('No active account selected for import.')
      return
    }

    if (!file) {
      setGeneralError('Please select a CSV or HDFC Bank .xls file to import.')
      return
    }

    setLoading(true)
    setGeneralError(null)
    setRowErrors([])
    setSuccessCount(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(
        `${apiBaseUrl}/api/transactions/import?account_id=${account.id}`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      )

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        if (response.status === 422 && data && Array.isArray(data.errors)) {
          setRowErrors(data.errors)
          setGeneralError(
            `Import failed with ${data.errors.length} validation error(s). Please review your statement file.`
          )
        } else {
          throw new Error(
            data?.detail || `Transaction import failed (${response.status})`
          )
        }
        return
      }

      const imported = data?.imported_count ?? 0
      setSuccessCount(imported)
      onImportSuccess(imported)
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : 'An unexpected error occurred during import.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setGeneralError(null)
    setRowErrors([])
    setSuccessCount(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleModalClose = () => {
    if (!loading) {
      handleReset()
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleModalClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow" style={{ margin: '0 0 4px' }}>
              Transaction Importer
            </p>
            <h2 className="modal-title">Import Statement</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleModalClose}
            aria-label="Close"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {account && (
          <div className="import-target-banner">
            Target Account: <strong>{account.name}</strong> (#{account.id} ·{' '}
            {account.institution || 'Demo Bank'})
          </div>
        )}

        {generalError && (
          <div className="auth-error-alert" role="alert">
            {generalError}
          </div>
        )}

        {successCount !== null ? (
          <div className="import-success-card">
            <div className="success-icon">✓</div>
            <h3>Import Successful!</h3>
            <p>
              Successfully imported <strong>{successCount}</strong> transactions into{' '}
              <strong>{account?.name}</strong>.
            </p>
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: '16px', width: '100%' }}
              onClick={handleModalClose}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="modal-form">
            <div className="file-dropzone">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,text/csv,application/vnd.ms-excel"
                onChange={handleFileChange}
                disabled={loading}
                className="file-input-hidden"
                id="statement-file-input"
              />
              <label htmlFor="statement-file-input" className="file-dropzone-label">
                <span className="upload-icon">📄</span>
                {file ? (
                  <div>
                    <strong style={{ color: '#102943', display: 'block' }}>
                      {file.name}
                    </strong>
                    <span className="card-meta">
                      {(file.size / 1024).toFixed(1)} KB · Click to change file
                    </span>
                  </div>
                ) : (
                  <div>
                    <strong style={{ color: '#102943', display: 'block' }}>
                      Choose a statement file
                    </strong>
                    <span className="card-meta">
                      Select a file from your computer (CSV or HDFC Bank .xls)
                    </span>
                  </div>
                )}
              </label>
            </div>

            <div className="csv-format-hint">
              <span className="hint-title">Supported Formats:</span>
              <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '12px', color: '#4b6076' }}>
                <li>
                  <strong>CSV:</strong> Standard <code>date, description, amount, currency</code>
                </li>
                <li>
                  <strong>HDFC Bank:</strong> Native <code>.xls</code> statement with Date, Narration, Withdrawal Amt., Deposit Amt.
                </li>
              </ul>
            </div>

            {rowErrors.length > 0 && (
              <div className="row-errors-box">
                <span className="row-errors-title">
                  Validation issues ({rowErrors.length}):
                </span>
                <ul className="row-errors-list">
                  {rowErrors.map((err, idx) => (
                    <li key={`${err.row}-${idx}`} className="row-error-item">
                      <strong>Row {err.row}:</strong> {err.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={handleModalClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-btn"
                disabled={loading || !file}
              >
                {loading ? 'Importing Transactions...' : 'Upload & Import'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
