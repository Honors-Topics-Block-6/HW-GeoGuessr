import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { ImageReportDoc } from '../../services/imageReportService';
import { CAUSE_LABELS } from '../../services/imageReportService';
import { getImageLocationByPoolId } from '../../services/imageService';
import './ImageReportDetailModal.css';

export interface ImageReportDetailModalProps {
  report: ImageReportDoc;
  onClose: () => void;
}

interface ActualLocation {
  correctLocation: { x: number; y: number };
  correctFloor: number | null;
}

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

function ImageReportDetailModal({ report, onClose }: ImageReportDetailModalProps): React.JSX.Element {
  const imageDisplayUrl =
    report.imageUrl?.startsWith('data:') || report.imageUrl?.startsWith('http')
      ? report.imageUrl
      : null;

  const [actualLocation, setActualLocation] = useState<ActualLocation | null>(null);

  useEffect(() => {
    if (!report.imageId) {
      setActualLocation(null);
      return;
    }
    let cancelled = false;
    getImageLocationByPoolId(report.imageId)
      .then((loc) => {
        if (!cancelled && loc) setActualLocation(loc);
      })
      .catch(() => {
        if (!cancelled) setActualLocation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [report.imageId]);

  const hasSuggested = report.suggestedLocation != null;
  const hasActual = actualLocation != null;
  const showMap = hasSuggested || hasActual;
  const showFloorComparison =
    report.suggestedFloor != null || actualLocation?.correctFloor != null;

  return createPortal(
    <div className="img-report-detail-overlay" onClick={onClose}>
      <div
        className="img-report-detail-content"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <button className="img-report-detail-close" onClick={onClose}>
          ×
        </button>
        <h3 className="img-report-detail-title">Image Report</h3>

        <div className="img-report-detail-body">
          <div className="img-report-detail-row">
            <span className="img-report-detail-label">Image ID</span>
            <span className="img-report-detail-value">
              {report.imageId ?? '—'}
            </span>
          </div>
          {report.imageUrl && (
            <div className="img-report-detail-row">
              <span className="img-report-detail-label">Image URL</span>
              <span className="img-report-detail-value img-report-detail-url">
                {report.imageUrl.length > 80
                  ? `${report.imageUrl.slice(0, 80)}…`
                  : report.imageUrl}
              </span>
            </div>
          )}
          {imageDisplayUrl && (
            <div className="img-report-detail-row">
              <span className="img-report-detail-label">Preview</span>
              <img
                src={imageDisplayUrl}
                alt="Reported image"
                className="img-report-detail-preview"
              />
            </div>
          )}
          <div className="img-report-detail-row">
            <span className="img-report-detail-label">Reporter</span>
            <span className="img-report-detail-value">
              {report.username}
              {report.userEmail && ` (${report.userEmail})`}
            </span>
          </div>
          <div className="img-report-detail-row">
            <span className="img-report-detail-label">Cause</span>
            <span className="img-report-detail-badge">
              {CAUSE_LABELS[report.cause] ?? report.cause}
            </span>
          </div>
          <div className="img-report-detail-row">
            <span className="img-report-detail-label">Explanation</span>
            <p className="img-report-detail-explanation">{report.explanation}</p>
          </div>
          {report.suggestedLocation != null && (
            <div className="img-report-detail-row">
              <span className="img-report-detail-label">Suggested location</span>
              <span className="img-report-detail-value">
                ({report.suggestedLocation.x.toFixed(1)}%,{' '}
                {report.suggestedLocation.y.toFixed(1)}%)
                {report.suggestedFloor != null && ` • Floor ${report.suggestedFloor}`}
              </span>
            </div>
          )}
          {showMap && (
            <div className="img-report-detail-row">
              <span className="img-report-detail-label">Location comparison</span>
              <div className="img-report-detail-map">
                <img
                  className="img-report-detail-map-image"
                  src="/FINAL_MAP.png"
                  alt="Campus Map"
                />
                {hasSuggested && (
                  <div
                    className="img-report-detail-marker img-report-detail-marker--suggested"
                    style={{
                      left: `${report.suggestedLocation!.x}%`,
                      top: `${report.suggestedLocation!.y}%`,
                    }}
                  >
                    <div className="img-report-detail-pin" />
                    <span className="img-report-detail-marker-label">Suggested</span>
                  </div>
                )}
                {hasActual && (
                  <div
                    className="img-report-detail-marker img-report-detail-marker--actual"
                    style={{
                      left: `${actualLocation!.correctLocation.x}%`,
                      top: `${actualLocation!.correctLocation.y}%`,
                    }}
                  >
                    <div className="img-report-detail-pin" />
                    <span className="img-report-detail-marker-label">Current</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {showFloorComparison && (
            <div className="img-report-detail-row">
              <span className="img-report-detail-label">Floor comparison</span>
              <div className="img-report-detail-floor-comparison">
                <span>
                  Suggested: {report.suggestedFloor != null ? `Floor ${report.suggestedFloor}` : '—'}
                </span>
                <span>
                  Current: {actualLocation?.correctFloor != null ? `Floor ${actualLocation.correctFloor}` : '—'}
                </span>
              </div>
            </div>
          )}
          <div className="img-report-detail-row">
            <span className="img-report-detail-label">Reported</span>
            <span className="img-report-detail-value">
              {formatDate(report.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ImageReportDetailModal;
