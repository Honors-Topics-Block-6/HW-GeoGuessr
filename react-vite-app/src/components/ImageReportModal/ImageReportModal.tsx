import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ImageReportCause, ImageReportPayload } from '../../services/imageReportService';
import {
  getRegions,
  getPlayingArea,
  getFloorsForPoint,
  isPointInPlayingArea,
  isPointInPolygon,
} from '../../services/regionService';
import { getBuildingPolygons } from '../../services/buildingPolygonService';
import type { Point, Region as RegionData, PlayingArea as PlayingAreaData } from '../../services/regionService';
import type { BuildingPolygon } from '../../utils/buildingPolygons';
import MapPicker from '../MapPicker/MapPicker';
import type { MapCoordinates } from '../MapPicker/MapPicker';
import FloorSelector from '../FloorSelector/FloorSelector';
import './ImageReportModal.css';

const CAUSE_OPTIONS: { value: ImageReportCause; label: string }[] = [
  { value: 'wrong_location', label: 'Wrong location / labelling' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Other' },
];

const ALL_FLOORS: number[] = [1, 2, 3];

export interface ImageReportModalProps {
  onClose: () => void;
  onSubmit: (payload: ImageReportPayload) => void;
}

function ImageReportModal({ onClose, onSubmit }: ImageReportModalProps): React.ReactElement {
  const [cause, setCause] = useState<ImageReportCause | ''>('');
  const [explanation, setExplanation] = useState('');
  const [suggestedLocation, setSuggestedLocation] = useState<MapCoordinates | null>(null);
  const [suggestedFloor, setSuggestedFloor] = useState<number | null>(null);
  const [overrideRestrictions, setOverrideRestrictions] = useState(false);
  const [clickRejected, setClickRejected] = useState(false);

  const [regions, setRegions] = useState<RegionData[]>([]);
  const [customBuildingPolygons, setCustomBuildingPolygons] = useState<BuildingPolygon[]>([]);
  const [playingArea, setPlayingArea] = useState<PlayingAreaData | null>(null);
  const [availableFloors, setAvailableFloors] = useState<number[] | null>(null);

  useEffect(() => {
    async function loadData(): Promise<void> {
      const [fetchedRegions, fetchedPlayingArea, fetchedPolygons] = await Promise.all([
        getRegions(),
        getPlayingArea(),
        getBuildingPolygons(),
      ]);
      setRegions(fetchedRegions);
      setPlayingArea(fetchedPlayingArea);
      setCustomBuildingPolygons(fetchedPolygons);
    }
    loadData();
  }, []);

  const handleMapClick = useCallback(
    (coords: MapCoordinates): void => {
      const insidePlayingArea = isPointInPlayingArea(coords, playingArea);
      const insideBuildingPolygon = customBuildingPolygons.some((poly) =>
        isPointInPolygon(coords as Point, poly.polygon as Point[])
      );
      if (!overrideRestrictions && !insidePlayingArea && !insideBuildingPolygon) {
        setClickRejected(true);
        setTimeout(() => setClickRejected(false), 500);
        return;
      }

      setSuggestedLocation(coords);
      setClickRejected(false);

      if (overrideRestrictions) {
        setAvailableFloors(ALL_FLOORS);
      } else {
        const floors = getFloorsForPoint(coords, regions);
        setAvailableFloors(floors);
        if (floors === null || (suggestedFloor !== null && !floors.includes(suggestedFloor))) {
          setSuggestedFloor(null);
        }
      }
    },
    [overrideRestrictions, playingArea, regions, customBuildingPolygons, suggestedFloor]
  );

  const handleFloorSelect = useCallback((floor: number): void => {
    setSuggestedFloor(floor);
  }, []);

  const handleOverrideChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const checked = e.target.checked;
      setOverrideRestrictions(checked);

      if (checked) {
        if (suggestedLocation) {
          setAvailableFloors(ALL_FLOORS);
        }
      } else {
        if (suggestedLocation) {
          const inPlayingArea = isPointInPlayingArea(suggestedLocation, playingArea);
          if (!inPlayingArea) {
            setSuggestedLocation(null);
            setSuggestedFloor(null);
            setAvailableFloors(null);
          } else {
            const floors = getFloorsForPoint(suggestedLocation, regions);
            setAvailableFloors(floors);
            if (floors === null || (suggestedFloor !== null && !floors.includes(suggestedFloor))) {
              setSuggestedFloor(null);
            }
          }
        }
      }
    },
    [suggestedLocation, playingArea, regions, suggestedFloor]
  );

  const isInRegion = availableFloors !== null && availableFloors.length > 0;
  const wrongLocationReady =
    suggestedLocation !== null && (!isInRegion || suggestedFloor !== null);

  const canSubmit =
    cause !== '' &&
    explanation.trim().length > 0 &&
    (cause !== 'wrong_location' || wrongLocationReady);

  const handleSubmit = (): void => {
    if (!canSubmit || cause === '') return;
    onSubmit({
      cause: cause as ImageReportCause,
      explanation: explanation.trim(),
      suggestedLocation: cause === 'wrong_location' ? suggestedLocation : null,
      suggestedFloor: cause === 'wrong_location' ? suggestedFloor : null,
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
                    if (opt.value !== 'wrong_location') {
                      setSuggestedLocation(null);
                      setSuggestedFloor(null);
                      setAvailableFloors(null);
                    }
                  }}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {cause === 'wrong_location' && (
          <div className="image-report-location-section">
            <label className="image-report-label">
              Where do you think this photo was taken?
            </label>
            <div className="image-report-map-wrapper">
              <MapPicker
                markerPosition={suggestedLocation}
                onMapClick={handleMapClick}
                clickRejected={clickRejected}
                playingArea={overrideRestrictions ? null : playingArea}
              />
            </div>

            <div className="image-report-override">
              <label className="image-report-override-label">
                <input
                  type="checkbox"
                  checked={overrideRestrictions}
                  onChange={handleOverrideChange}
                />
                <span>Allow any location and floor</span>
              </label>
              <p className="image-report-override-hint">
                Bypasses playing area and region restrictions
              </p>
            </div>

            {isInRegion && (
              <FloorSelector
                selectedFloor={suggestedFloor}
                onFloorSelect={handleFloorSelect}
                floors={availableFloors ?? []}
              />
            )}

            <div className="image-report-status">
              <div className={`image-report-status-item ${suggestedLocation ? 'complete' : ''}`}>
                <span className="image-report-status-icon">
                  {suggestedLocation ? '✓' : '○'}
                </span>
                <span>Location selected</span>
              </div>
              {isInRegion && (
                <div className={`image-report-status-item ${suggestedFloor ? 'complete' : ''}`}>
                  <span className="image-report-status-icon">
                    {suggestedFloor ? '✓' : '○'}
                  </span>
                  <span>Floor selected</span>
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
