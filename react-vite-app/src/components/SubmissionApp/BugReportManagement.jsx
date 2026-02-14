import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  subscribeToBugReports,
  VALID_CATEGORIES,
  VALID_SEVERITIES,
  VALID_STATUSES
} from '../../services/bugReportService'
import BugReportDetailModal from './BugReportDetailModal'
import './BugReportManagement.css'

const CATEGORY_LABELS = {
  gameplay: 'Gameplay',
  ui: 'UI / Visual',
  performance: 'Performance',
  map: 'Map / Location',
  multiplayer: 'Multiplayer',
  other: 'Other'
}

const SEVERITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical'
}

const STATUS_LABELS = {
  'open': 'Open',
  'in-progress': 'In Progress',
  'resolved': 'Resolved',
  'wont-fix': "Won't Fix",
  'closed': 'Closed'
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * Format a Firestore timestamp or ISO string for display.
 */
function formatDate(timestamp) {
  if (!timestamp) return 'N/A'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Admin bug report management component.
 * Shows all bug reports with filtering, sorting, and detail view.
 */
function BugReportManagement() {
  const { user, userDoc } = useAuth()

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [sortBy, setSortBy] = useState('date') // 'date' | 'severity'

  // Detail modal
  const [selectedReport, setSelectedReport] = useState(null)

  // Subscribe to bug reports in real-time
  useEffect(() => {
    const unsubscribe = subscribeToBugReports((updatedReports) => {
      setReports(updatedReports)
      setLoading(false)
      setError(null)
    })

    return () => unsubscribe()
  }, [])

  // Apply filters and sorting
  const filteredReports = reports
    .filter(report => {
      if (filterStatus !== 'all' && report.status !== filterStatus) return false
      if (filterCategory !== 'all' && report.category !== filterCategory) return false
      if (filterSeverity !== 'all' && report.severity !== filterSeverity) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'severity') {
        const aSev = SEVERITY_ORDER[a.severity] ?? 99
        const bSev = SEVERITY_ORDER[b.severity] ?? 99
        if (aSev !== bSev) return aSev - bSev
      }
      // Default to date sort (most recent first)
      const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0
      const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0
      return bTime - aTime
    })

  // When the detail modal triggers an update, refresh the selected report
  const handleReportUpdated = () => {
    // The real-time subscription will automatically update the reports list.
    // We need to update the selectedReport to show the latest data.
    if (selectedReport) {
      // Find the updated version in the reports list on next render
      const updated = reports.find(r => r.id === selectedReport.id)
      if (updated) {
        setSelectedReport({ ...updated })
      }
    }
  }

  // Count stats
  const openCount = reports.filter(r => r.status === 'open').length
  const inProgressCount = reports.filter(r => r.status === 'in-progress').length
  const criticalCount = reports.filter(r => r.severity === 'critical' && r.status !== 'resolved' && r.status !== 'closed').length

  if (loading) {
    return (
      <div className="bug-mgmt">
        <div className="bug-mgmt-loading">Loading bug reports...</div>
      </div>
    )
  }

  return (
    <div className="bug-mgmt">
      <div className="bug-mgmt-header">
        <h3>
          Bug Reports
          {criticalCount > 0 && (
            <span style={{ fontSize: 12, color: '#f87171', marginLeft: 10, fontWeight: 600 }}>
              {criticalCount} critical
            </span>
          )}
        </h3>
        <span className="bug-mgmt-count">
          {filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''}
          {filterStatus === 'all' && ` (${openCount} open, ${inProgressCount} in progress)`}
        </span>
      </div>

      {error && <div className="bug-mgmt-error">{error}</div>}

      {/* Filters */}
      <div className="bug-mgmt-filters">
        <div className="bug-mgmt-filter-group">
          <span className="bug-mgmt-filter-label">Status</span>
          <select
            className="bug-mgmt-filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {VALID_STATUSES.map(status => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]} ({reports.filter(r => r.status === status).length})
              </option>
            ))}
          </select>
        </div>

        <div className="bug-mgmt-filter-group">
          <span className="bug-mgmt-filter-label">Category</span>
          <select
            className="bug-mgmt-filter-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {VALID_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]} ({reports.filter(r => r.category === cat).length})
              </option>
            ))}
          </select>
        </div>

        <div className="bug-mgmt-filter-group">
          <span className="bug-mgmt-filter-label">Severity</span>
          <select
            className="bug-mgmt-filter-select"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="all">All Severities</option>
            {VALID_SEVERITIES.map(sev => (
              <option key={sev} value={sev}>
                {SEVERITY_LABELS[sev]} ({reports.filter(r => r.severity === sev).length})
              </option>
            ))}
          </select>
        </div>

        <div className="bug-mgmt-filter-group">
          <span className="bug-mgmt-filter-label">Sort By</span>
          <select
            className="bug-mgmt-filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="date">Most Recent</option>
            <option value="severity">Severity (Critical First)</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {filteredReports.length === 0 && !error && (
        <div className="bug-mgmt-empty">
          <span className="bug-mgmt-empty-icon">🐛</span>
          <div className="bug-mgmt-empty-text">
            {reports.length === 0
              ? 'No bug reports have been submitted yet.'
              : 'No bug reports match your filters.'
            }
          </div>
        </div>
      )}

      {/* Reports table */}
      {filteredReports.length > 0 && (
        <div className="bug-mgmt-table-wrapper">
          <table className="bug-mgmt-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Reporter</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map(report => (
                <tr key={report.id}>
                  <td className="bug-mgmt-title-cell" title={report.title}>
                    {report.title}
                  </td>
                  <td className="bug-mgmt-reporter-cell">
                    {report.username}
                  </td>
                  <td>
                    <span className="bug-mgmt-badge category">
                      {CATEGORY_LABELS[report.category] || report.category}
                    </span>
                  </td>
                  <td>
                    <span className={`bug-mgmt-badge severity-${report.severity}`}>
                      {SEVERITY_LABELS[report.severity] || report.severity}
                    </span>
                  </td>
                  <td>
                    <span className={`bug-mgmt-badge status-${report.status}`}>
                      {STATUS_LABELS[report.status] || report.status}
                    </span>
                  </td>
                  <td className="bug-mgmt-date-cell">
                    {formatDate(report.createdAt)}
                  </td>
                  <td>
                    <button
                      className="bug-mgmt-view-btn"
                      onClick={() => setSelectedReport(report)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selectedReport && (
        <BugReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          adminUid={user?.uid}
          adminUsername={userDoc?.username}
          onReportUpdated={handleReportUpdated}
        />
      )}
    </div>
  )
}

export default BugReportManagement
