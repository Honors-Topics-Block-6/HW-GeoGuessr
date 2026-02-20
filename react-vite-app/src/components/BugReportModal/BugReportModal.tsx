import { useState, useRef, useEffect, type ChangeEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  submitBugReport,
  getBugReportsByUser,
  captureEnvironment,
  VALID_CATEGORIES,
  VALID_SEVERITIES,
  type BugReportDoc,
  type BugReportCategory,
  type BugReportSeverity
} from '../../services/bugReportService'
import { compressImage } from '../../utils/compressImage'
import './BugReportModal.css'

type CategoryKey = 'gameplay' | 'ui' | 'performance' | 'map' | 'multiplayer' | 'other';
type SeverityKey = 'low' | 'medium' | 'high' | 'critical';
type TabKey = 'submit' | 'history';

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  gameplay: 'Gameplay',
  ui: 'UI / Visual',
  performance: 'Performance',
  map: 'Map / Location',
  multiplayer: 'Multiplayer',
  other: 'Other'
}

const SEVERITY_LABELS: Record<SeverityKey, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical'
}

interface FirestoreTimestamp {
  toDate: () => Date;
}

interface AdminNote {
  text: string;
  [key: string]: unknown;
}

interface BugReport {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  createdAt: FirestoreTimestamp | string | null;
  adminNotes?: AdminNote[];
}

/**
 * Format a Firestore timestamp or ISO string for display.
 */
function formatDate(timestamp: unknown): string {
  if (!timestamp) return 'N/A'
  const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
    ? (timestamp as FirestoreTimestamp).toDate()
    : new Date(timestamp as string)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export interface BugReportModalProps {
  onClose: () => void;
  userId: string;
  username: string;
  userEmail: string;
}

/**
 * Bug Report Modal — user-facing modal for submitting bug reports
 * and viewing report history.
 */
function BugReportModal({ onClose, userId, username, userEmail }: BugReportModalProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>('submit')

  // ── Submit tab state ──
  const [title, setTitle] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [severity, setSeverity] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [stepsToReproduce, setStepsToReproduce] = useState<string>('')
  const [screenshot, setScreenshot] = useState<string | null>(null) // compressed base64
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<boolean>(false)

  // ── History tab state ──
  const [reports, setReports] = useState<BugReportDoc[]>([])
  const [loadingReports, setLoadingReports] = useState<boolean>(false)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState<boolean>(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup any pending auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current)
        autoCloseTimeoutRef.current = null
      }
    }
  }, [])

  // Load reports when switching to history tab
  useEffect(() => {
    if (activeTab !== 'history' || historyLoaded) return

    let cancelled = false
    setLoadingReports(true)
    setReportsError(null)

    getBugReportsByUser(userId)
      .then((userReports: BugReportDoc[]) => {
        if (!cancelled) {
          setReports(userReports)
          setHistoryLoaded(true)
        }
      })
      .catch((err: Error) => {
        console.error('Failed to load bug reports:', err)
        if (!cancelled) {
          setReportsError('Failed to load your reports.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingReports(false)
        }
      })

    return () => { cancelled = true }
  }, [activeTab, historyLoaded, userId])

  const handleScreenshotSelect = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image file is too large (max 10MB).')
      return
    }

    try {
      const compressed = await compressImage(file, {
        maxWidth: 600,
        maxHeight: 600,
        quality: 0.6
      })

      // Check compressed size (Firestore doc limit is 1MB, leave room for other fields)
      if (compressed.length > 500_000) {
        setError('Compressed image is too large. Please use a smaller image.')
        return
      }

      setScreenshot(compressed)
      setScreenshotPreview(compressed)
      setError(null)
    } catch (err) {
      console.error('Failed to compress image:', err)
      setError('Failed to process the image. Please try another.')
    }
  }

  const handleRemoveScreenshot = (): void => {
    setScreenshot(null)
    setScreenshotPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError(null)

    // Client-side validation
    if (!title.trim()) {
      setError('Please enter a title for your bug report.')
      return
    }
    if (!category) {
      setError('Please select a category.')
      return
    }
    if (!severity) {
      setError('Please select a severity level.')
      return
    }
    if (!description.trim()) {
      setError('Please provide a description of the bug.')
      return
    }

    try {
      setSubmitting(true)
      await submitBugReport({
        userId,
        username,
        userEmail,
        title: title.trim(),
        category: category as BugReportCategory,
        severity: severity as BugReportSeverity,
        description: description.trim(),
        stepsToReproduce: stepsToReproduce.trim(),
        screenshot,
        environment: captureEnvironment()
      })

      setSuccess(true)
      // Reset form for next time
      setHistoryLoaded(false)

      // Auto-close after 2 seconds
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current)
      }
      autoCloseTimeoutRef.current = setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err: unknown) {
      console.error('Failed to submit bug report:', err)
      const message = err instanceof Error ? err.message : 'Failed to submit bug report. Please try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const getCharCountClass = (current: number, max: number): string => {
    const ratio = current / max
    if (ratio >= 0.95) return 'bug-report-char-count danger'
    if (ratio >= 0.8) return 'bug-report-char-count warning'
    return 'bug-report-char-count'
  }

  const isFormValid = title.trim() && category && severity && description.trim()

  return createPortal(
    <div className="bug-report-overlay" onClick={onClose}>
      <div className="bug-report-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <button className="bug-report-close" onClick={onClose}>&times;</button>

        <h3 className="bug-report-title">
          <span className="bug-report-title-icon">🐛</span>
          Report a Bug
        </h3>

        {/* Tab switcher */}
        <div className="bug-report-tabs">
          <button
            className={`bug-report-tab ${activeTab === 'submit' ? 'active' : ''}`}
            onClick={() => setActiveTab('submit')}
          >
            Submit Report
          </button>
          <button
            className={`bug-report-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            My Reports
          </button>
        </div>

        {/* ─── Submit Report Tab ─── */}
        {activeTab === 'submit' && (
          <>
            {error && <div className="bug-report-error">{error}</div>}
            {success && (
              <div className="bug-report-success">
                Bug report submitted! Thank you for your feedback.
              </div>
            )}

            <form onSubmit={handleSubmit} className="bug-report-form">
              {/* Title */}
              <div className="bug-report-field">
                <label className="bug-report-label" htmlFor="bug-title">
                  Title <span className="bug-report-required">*</span>
                </label>
                <input
                  id="bug-title"
                  type="text"
                  className="bug-report-input"
                  value={title}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setTitle(e.target.value)
                    setError(null)
                  }}
                  placeholder="Brief summary of the bug..."
                  disabled={submitting || success}
                  maxLength={100}
                />
                <span className={getCharCountClass(title.length, 100)}>
                  {title.length}/100
                </span>
              </div>

              {/* Category */}
              <div className="bug-report-field">
                <label className="bug-report-label" htmlFor="bug-category">
                  Category <span className="bug-report-required">*</span>
                </label>
                <select
                  id="bug-category"
                  className="bug-report-select"
                  value={category}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setCategory(e.target.value)
                    setError(null)
                  }}
                  disabled={submitting || success}
                >
                  <option value="">Select a category...</option>
                  {VALID_CATEGORIES.map((cat: string) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat as CategoryKey]}</option>
                  ))}
                </select>
              </div>

              {/* Severity */}
              <div className="bug-report-field">
                <label className="bug-report-label">
                  Severity <span className="bug-report-required">*</span>
                </label>
                <div className="bug-report-severity-group">
                  {VALID_SEVERITIES.map((sev: string) => (
                    <button
                      key={sev}
                      type="button"
                      className={`bug-report-severity-btn severity-${sev} ${severity === sev ? 'selected' : ''}`}
                      onClick={() => {
                        setSeverity(sev)
                        setError(null)
                      }}
                      disabled={submitting || success}
                    >
                      {SEVERITY_LABELS[sev as SeverityKey]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="bug-report-field">
                <label className="bug-report-label" htmlFor="bug-description">
                  Description <span className="bug-report-required">*</span>
                </label>
                <textarea
                  id="bug-description"
                  className="bug-report-textarea"
                  value={description}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                    setDescription(e.target.value)
                    setError(null)
                  }}
                  placeholder="Describe what happened, what you expected, and what actually occurred..."
                  disabled={submitting || success}
                  rows={4}
                  maxLength={2000}
                />
                <span className={getCharCountClass(description.length, 2000)}>
                  {description.length}/2000
                </span>
              </div>

              {/* Steps to Reproduce */}
              <div className="bug-report-field">
                <label className="bug-report-label" htmlFor="bug-steps">
                  Steps to Reproduce <span style={{ fontSize: '10px', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <textarea
                  id="bug-steps"
                  className="bug-report-textarea"
                  value={stepsToReproduce}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setStepsToReproduce(e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  disabled={submitting || success}
                  rows={3}
                  maxLength={1000}
                />
                <span className={getCharCountClass(stepsToReproduce.length, 1000)}>
                  {stepsToReproduce.length}/1000
                </span>
              </div>

              {/* Screenshot */}
              <div className="bug-report-field">
                <label className="bug-report-label">
                  Screenshot <span style={{ fontSize: '10px', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="bug-report-screenshot-file-input"
                  onChange={handleScreenshotSelect}
                  disabled={submitting || success}
                />
                {screenshotPreview ? (
                  <div className="bug-report-screenshot-area has-image">
                    <div className="bug-report-screenshot-preview">
                      <img src={screenshotPreview} alt="Screenshot preview" />
                      <button
                        type="button"
                        className="bug-report-screenshot-remove"
                        onClick={handleRemoveScreenshot}
                        disabled={submitting || success}
                        title="Remove screenshot"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="bug-report-screenshot-area"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="bug-report-screenshot-placeholder">
                      <span className="bug-report-screenshot-icon">📷</span>
                      <span className="bug-report-screenshot-text">Click to attach a screenshot</span>
                      <span className="bug-report-screenshot-hint">PNG, JPG, or GIF up to 10MB</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="bug-report-actions">
                <button
                  type="submit"
                  className="bug-report-submit"
                  disabled={submitting || success || !isFormValid}
                >
                  {submitting ? 'Submitting...' : success ? 'Submitted!' : 'Submit Report'}
                </button>
                <button
                  type="button"
                  className="bug-report-cancel"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}

        {/* ─── My Reports Tab ─── */}
        {activeTab === 'history' && (
          <div className="bug-report-history">
            {loadingReports && (
              <div className="bug-report-history-loading">Loading your reports...</div>
            )}

            {reportsError && (
              <div className="bug-report-error">{reportsError}</div>
            )}

            {!loadingReports && !reportsError && reports.length === 0 && (
              <div className="bug-report-history-empty">
                <span className="bug-report-history-empty-icon">📋</span>
                You haven&apos;t submitted any bug reports yet.
              </div>
            )}

            {!loadingReports && reports.map((report: BugReportDoc) => (
              <div key={report.id} className="bug-report-history-card">
                <div className="bug-report-history-card-header">
                  <span className="bug-report-history-card-title">{report.title}</span>
                  <div className="bug-report-history-card-badges">
                    <span className={`bug-report-badge status-${report.status}`}>
                      {report.status === 'wont-fix' ? "Won't Fix" : report.status.replace('-', ' ')}
                    </span>
                    <span className={`bug-report-badge severity-${report.severity}`}>
                      {report.severity}
                    </span>
                  </div>
                </div>
                <div className="bug-report-history-card-description">
                  {report.description}
                </div>
                <div className="bug-report-history-card-badges" style={{ marginBottom: 6 }}>
                  <span className="bug-report-badge category">
                    {CATEGORY_LABELS[report.category as CategoryKey] || report.category}
                  </span>
                </div>
                <div className="bug-report-history-card-date">
                  Submitted {formatDate(report.createdAt)}
                  {report.adminNotes && report.adminNotes.length > 0 && (
                    <span> &middot; {report.adminNotes.length} admin note{report.adminNotes.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default BugReportModal
