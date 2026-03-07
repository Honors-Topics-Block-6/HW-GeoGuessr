import { useState, useEffect } from 'react';
import {
  subscribeToImageReports,
  CAUSE_LABELS,
  type ImageReportDoc,
  type ImageReportCause,
} from '../../services/imageReportService';
import ImageReportDetailModal from './ImageReportDetailModal';
import './ImageReportManagement.css';

const CAUSE_OPTIONS: ImageReportCause[] = ['wrong_location', 'inappropriate', 'other'];

function formatDate(timestamp: unknown): string {
  if (!timestamp) return 'N/A';
  const date =
    typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp
      ? (timestamp as { toDate: () => Date }).toDate()
      : new Date(timestamp as string);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface ImageReportManagementProps {}

function ImageReportManagement(_props: ImageReportManagementProps): React.JSX.Element {
  const [reports, setReports] = useState<ImageReportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCause, setFilterCause] = useState<Set<string>>(
    () => new Set(CAUSE_OPTIONS)
  );
  const [selectedReport, setSelectedReport] = useState<ImageReportDoc | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToImageReports((updatedReports) => {
      setReports(updatedReports);
      setLoading(false);
      setError(null);
    });
    return () => unsubscribe();
  }, []);

  const toggleCause = (cause: string): void => {
    const next = new Set(filterCause);
    if (next.has(cause)) {
      next.delete(cause);
    } else {
      next.add(cause);
    }
    setFilterCause(next);
  };

  const filteredReports = reports.filter((r) => filterCause.has(r.cause));

  if (loading) {
    return (
      <div className="img-report-mgmt">
        <div className="img-report-mgmt-loading">Loading image reports...</div>
      </div>
    );
  }

  return (
    <div className="img-report-mgmt">
      <div className="img-report-mgmt-header">
        <h3>Image Reports</h3>
        <span className="img-report-mgmt-count">
          {filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && <div className="img-report-mgmt-error">{error}</div>}

      <div className="img-report-mgmt-filters">
        <span className="img-report-mgmt-filter-label">Cause</span>
        <div className="img-report-mgmt-pills">
          {CAUSE_OPTIONS.map((cause) => (
            <button
              key={cause}
              className={`img-report-mgmt-pill ${filterCause.has(cause) ? 'active' : ''}`}
              onClick={() => toggleCause(cause)}
            >
              {CAUSE_LABELS[cause]}
              <span className="img-report-mgmt-pill-count">
                {reports.filter((r) => r.cause === cause).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filteredReports.length === 0 && !error && (
        <div className="img-report-mgmt-empty">
          <span className="img-report-mgmt-empty-icon">📍</span>
          <div className="img-report-mgmt-empty-text">
            {reports.length === 0
              ? 'No image reports have been submitted yet.'
              : 'No reports match your filters.'}
          </div>
        </div>
      )}

      {filteredReports.length > 0 && (
        <div className="img-report-mgmt-table-wrapper">
          <table className="img-report-mgmt-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Reporter</th>
                <th>Cause</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr key={report.id}>
                  <td className="img-report-mgmt-image-cell">
                    {report.imageId ?? report.imageUrl ?? '—'}
                  </td>
                  <td>{report.username}</td>
                  <td>
                    <span className="img-report-mgmt-badge cause">
                      {CAUSE_LABELS[report.cause] ?? report.cause}
                    </span>
                  </td>
                  <td className="img-report-mgmt-date-cell">
                    {formatDate(report.createdAt)}
                  </td>
                  <td>
                    <button
                      className="img-report-mgmt-view-btn"
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

      {selectedReport && (
        <ImageReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  );
}

export default ImageReportManagement;
