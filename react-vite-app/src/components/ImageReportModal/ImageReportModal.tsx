import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ImageReportCause, ImageReportPayload } from '../../services/imageReportService';
import './ImageReportModal.css';

const CAUSE_OPTIONS: { value: ImageReportCause; label: string }[] = [
  { value: 'wrong_location', label: 'Wrong location / labelling' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Other' }
];

export interface ImageReportModalProps {
  onClose: () => void;
  onSubmit: (payload: ImageReportPayload) => void;
}

export interface MapCoords {
  x: number;
  y: number;
}

function ImageReportModal({ onClose, onSubmit }: ImageReportModalProps): React.ReactElement {
  const [cause, setCause] = useState<ImageReportCause | ''>('');
  const [explanation, setExplanation] = useState('');
  const [suggestedLocation, setSuggestedLocation] = useState<MapCoords | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSuggestedLocation({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y))
    });
  }, []);

  const canSubmit =
    cause !== '' &&
    explanation.trim().length > 0 &&
    (cause !== 'wrong_location' || suggestedLocation !== null);

  const handleSubmit = (): void => {
    if (!canSubmit || cause === '') return;
    onSubmit({
      cause: cause as ImageReportCause,
      explanation: explanation.trim(),
      suggestedLocation: cause === 'wrong_location' ? suggestedLocation : null
    });
  };

  return createPortal(
    <div
      className="image-report-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-report-title"
    >
      <div
        className="image-report-modal"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h2 id="image-report-title" className="image-report-title">
          Report Image
        </h2>
        <button
          type="button"
          className="image-report-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <div className="image-report-field">
          <label className="image-report-label">Cause</label>
          <div className="image-report-causes">
            {CAUSE_OPTIONS.map((opt) => (
              <label key={opt.value} className="image-report-cause-option">
                <input
                  type="radio"
                  name="cause"
                  value={opt.value}
                  checked={cause === opt.value}
                  onChange={() => {
                    setCause(opt.value as ImageReportCause);
                    if (opt.value !== 'wrong_location') setSuggestedLocation(null);
                  }}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {cause === 'wrong_location' && (
          <div className="image-report-field">
            <label className="image-report-label">
              Where do you think this photo was taken?</label>
            <div
              ref={mapRef}
              className="image-report-map"
              onClick={handleMapClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  // Focus/click for accessibility - user would need to click to place
                }
              }}
              aria-label="Click on the map to place a marker where you think the photo was taken"
            >
              <img
                ref={imageRef}
                src="/FINAL_MAP.png"
                alt="Campus Map"
                draggable={false}
                className="image-report-map-img"
              />
              {suggestedLocation && (
                <div
                  className="image-report-map-marker"
                  style={{
                    left: `${suggestedLocation.x}%`,
                    top: `${suggestedLocation.y}%`
                  }}
                >
                  <div className="image-report-marker-pin" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="image-report-field">
          <label htmlFor="image-report-explanation" className="image-report-label">
            Explanation (required)
          </label>
          <textarea
            id="image-report-explanation"
            className="image-report-explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Please describe the issue..."
            rows={4}
          />
        </div>

        <div className="image-report-actions">
          <button type="button" className="image-report-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="image-report-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Submit Report
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ImageReportModal;
