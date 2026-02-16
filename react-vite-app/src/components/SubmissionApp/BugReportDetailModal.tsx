import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  updateBugReportStatus,
  addAdminNote,
  VALID_STATUSES
} from '../../services/bugReportService'
import type {
  BugReportDoc,
  BugReportStatus,
  EnvironmentInfo,
  AdminNote
} from '../../services/bugReportService'
import './BugReportDetailModal.css'

const CATEGORY_LABELS: Record<string, string> = {
  gameplay: 'Gameplay',
  ui: 'UI / Visual',
  performance: 'Performance',
  map: 'Map / Location',
  multiplayer: 'Multiplayer',
  other: 'Other'
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical'
}

const STATUS_LABELS: Record<string, string> = {
  'open': 'Open',
  'in-progress': 'In Progress',
  'resolved': 'Resolved',
  'wont-fix': "Won't Fix",
  'closed': 'Closed'
}

export type BugReport = BugReportDoc

export interface BugReportDetailModalProps {
  report: BugReport
  onClose: () => void
  adminUid: string | undefined
  adminUsername: string | undefined
  onReportUpdated?: () => void
}

/**
 * Format a Firestore timestamp or ISO string for display.
 */
function formatDate(timestamp: unknown): string {
  if (!timestamp) return 'N/A'
  const date = typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
    ? (timestamp as { toDate: () => Date }).toDate()
    : new Date(timestamp as string)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function BugReportDetailModal({ report, onClose, adminUid, adminUsername, onReportUpdated }: BugReportDetailModalProps): React.JSX.Element {
  const [selectedStatus, setSelectedStatus] = useState<string>(report.status)
  const [noteText, setNoteText] = useState<string>('')
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false)
  const [addingNote, setAddingNote] = useState<boolean>(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [showEnvironment, setShowEnvironment] = useState<boolean>(false)

  const handleUpdateStatus = async (): Promise<void> => {
    if (selectedStatus === report.status) return
    setActionError(null)
    setActionSuccess(null)

    try {
      setUpdatingStatus(true)
      await updateBugReportStatus(report.id, selectedStatus as BugReportStatus, adminUid ?? '', adminUsername ?? '')
      setActionSuccess('Status updated successfully.')
      if (onReportUpdated) onReportUpdated()
      setTimeout(() => setActionSuccess(null), 3000)
    } catch (err) {
      console.error('Failed to update status:', err)
      setActionError((err as Error).message || 'Failed to update status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleAddNote = async (): Promise<void> => {
    if (!noteText.trim()) return
    setActionError(null)
    setActionSuccess(null)

    try {
      setAddingNote(true)
      await addAdminNote(report.id, adminUid ?? '', adminUsername ?? '', noteText.trim())
      setNoteText('')
      setActionSuccess('Note added successfully.')
      if (onReportUpdated) onReportUpdated()
      setTimeout(() => setActionSuccess(null), 3000)
    } catch (err) {
      console.error('Failed to add note:', err)
      setActionError((err as Error).message || 'Failed to add note.')
    } finally {
      setAddingNote(false)
    }
  }

  const env: Partial<EnvironmentInfo> = report.environment || {}

  return createPortal(
    <div className="bug-detail-overlay" onClick={onClose}>
      <div className="bug-detail-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <button className="bug-detail-close" onClick={onClose}>&times;</button>

        {/* Header */}
        <div className="bug-detail-header">
          <h3 className="bug-detail-title">{report.title}</h3>
          <div className="bug-detail-badges">
            <span className={`bug-detail-badge status-${report.status}`}>
              {STATUS_LABELS[report.status] || report.status}
            </span>
            <span className={`bug-detail-badge severity-${report.severity}`}>
              {SEVERITY_LABELS[report.severity] || report.severity}
            </span>
            <span className="bug-detail-badge category">
              {CATEGORY_LABELS[report.category] || report.category}
            </span>
          </div>
        </div>

        {/* Reporter info */}
        <div className="bug-detail-reporter">
          <div className="bug-detail-reporter-item">
            <span className="bug-detail-reporter-label">Reporter</span>
            <span className="bug-detail-reporter-value">{report.username}</span>
          </div>
          <div className="bug-detail-reporter-item">
            <span className="bug-detail-reporter-label">Email</span>
            <span className="bug-detail-reporter-value">{report.userEmail || 'N/A'}</span>
          </div>
          <div className="bug-detail-reporter-item">
            <span className="bug-detail-reporter-label">Submitted</span>
            <span className="bug-detail-reporter-value">{formatDate(report.createdAt)}</span>
          </div>
          <div className="bug-detail-reporter-item">
            <span className="bug-detail-reporter-label">User ID</span>
            <span className="bug-detail-reporter-value" style={{ fontSize: 11, fontFamily: 'monospace' }}>
              {report.userId}
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="bug-detail-section">
          <div className="bug-detail-section-label">Description</div>
          <div className="bug-detail-section-text">{report.description}</div>
        </div>

        {/* Steps to Reproduce */}
        {report.stepsToReproduce && (
          <div className="bug-detail-section">
            <div className="bug-detail-section-label">Steps to Reproduce</div>
            <div className="bug-detail-section-text">{report.stepsToReproduce}</div>
          </div>
        )}

        {/* Screenshot */}
        {report.screenshot && (
          <div className="bug-detail-screenshot">
            <div className="bug-detail-section-label">Screenshot</div>
            <img src={report.screenshot} alt="Bug screenshot" />
          </div>
        )}

        {/* Environment */}
        {report.environment && (
          <div className="bug-detail-env">
            <button
              className="bug-detail-env-toggle"
              onClick={() => setShowEnvironment(!showEnvironment)}
            >
              <span>Environment Details</span>
              <span className={`bug-detail-env-arrow ${showEnvironment ? 'open' : ''}`}>
                &#9660;
              </span>
            </button>
            {showEnvironment && (
              <div className="bug-detail-env-details">
                <div className="bug-detail-env-item full-width">
                  <span className="bug-detail-env-key">User Agent</span>
                  <span className="bug-detail-env-value">{env.userAgent || 'N/A'}</span>
                </div>
                <div className="bug-detail-env-item">
                  <span className="bug-detail-env-key">Platform</span>
                  <span className="bug-detail-env-value">{env.platform || 'N/A'}</span>
                </div>
                <div className="bug-detail-env-item">
                  <span className="bug-detail-env-key">Language</span>
                  <span className="bug-detail-env-value">{env.language || 'N/A'}</span>
                </div>
                <div className="bug-detail-env-item">
                  <span className="bug-detail-env-key">Screen</span>
                  <span className="bug-detail-env-value">
                    {env.screenWidth || '?'} x {env.screenHeight || '?'}
                  </span>
                </div>
                <div className="bug-detail-env-item">
                  <span className="bug-detail-env-key">Window</span>
                  <span className="bug-detail-env-value">
                    {env.windowWidth || '?'} x {env.windowHeight || '?'}
                  </span>
                </div>
                <div className="bug-detail-env-item full-width">
                  <span className="bug-detail-env-key">Captured At</span>
                  <span className="bug-detail-env-value">{env.timestamp || 'N/A'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <hr className="bug-detail-divider" />

        {/* Admin Actions */}
        <div className="bug-detail-actions">
          <div className="bug-detail-actions-title">Admin Actions</div>

          {actionError && <div className="bug-detail-action-error">{actionError}</div>}
          {actionSuccess && <div className="bug-detail-action-success">{actionSuccess}</div>}

          {/* Status update */}
          <div className="bug-detail-status-row">
            <select
              className="bug-detail-status-select"
              value={selectedStatus}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedStatus(e.target.value)}
              disabled={updatingStatus}
            >
              {VALID_STATUSES.map((status: string) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status] || status}
                </option>
              ))}
            </select>
            <button
              className="bug-detail-update-btn"
              onClick={handleUpdateStatus}
              disabled={updatingStatus || selectedStatus === report.status}
            >
              {updatingStatus ? 'Updating...' : 'Update Status'}
            </button>
          </div>

          {/* Add note */}
          <div className="bug-detail-note-form">
            <textarea
              className="bug-detail-note-textarea"
              value={noteText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNoteText(e.target.value)}
              placeholder="Add an admin note..."
              disabled={addingNote}
              rows={2}
              maxLength={500}
            />
            <div className="bug-detail-note-row">
              <span className="bug-detail-note-char-count">{noteText.length}/500</span>
              <button
                className="bug-detail-add-note-btn"
                onClick={handleAddNote}
                disabled={addingNote || !noteText.trim()}
              >
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>

        {/* Admin Notes History */}
        {report.adminNotes && report.adminNotes.length > 0 && (
          <div className="bug-detail-notes">
            <div className="bug-detail-section-label">
              Admin Notes ({report.adminNotes.length})
            </div>
            <div className="bug-detail-notes-list">
              {report.adminNotes.map((note: AdminNote, index: number) => (
                <div key={index} className="bug-detail-note-card">
                  <div className="bug-detail-note-card-header">
                    <span className="bug-detail-note-card-admin">
                      {note.adminUsername || 'Admin'}
                    </span>
                    <span className="bug-detail-note-card-date">
                      {formatDate(note.createdAt)}
                    </span>
                  </div>
                  <div className="bug-detail-note-card-text">{note.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!report.adminNotes || report.adminNotes.length === 0) && (
          <div className="bug-detail-notes">
            <div className="bug-detail-section-label">Admin Notes</div>
            <div className="bug-detail-notes-empty">No admin notes yet.</div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default BugReportDetailModal
