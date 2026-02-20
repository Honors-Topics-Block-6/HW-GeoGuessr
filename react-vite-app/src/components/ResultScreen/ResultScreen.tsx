import { useRef, useEffect, useState, useCallback } from 'react';
import useMapZoom from '../../hooks/useMapZoom';
import LeaveConfirmModal from '../LeaveConfirmModal/LeaveConfirmModal';
import './ResultScreen.css';

export interface MapPoint {
  x: number;
  y: number;
}

export interface ResultScreenProps {
  guessLocation: MapPoint | null;
  guessFloor: number | null;
  actualLocation: MapPoint;
  actualFloor: number | null;
  imageUrl: string;
  locationScore: number | null;
  floorCorrect: boolean | null;
  totalScore: number;
  timeTakenSeconds: number | null;
  timedOut: boolean;
  noGuess: boolean;
  roundNumber: number;
  totalRounds: number;
  onNextRound: () => void;
  onViewFinalResults: () => void;
  isLastRound: boolean;
  onBackToTitle?: () => void;
}

/**
 * Calculate distance between two points (in percentage coordinates)
 * Returns distance as a percentage of the map diagonal
 */
function calculateDistance(guess: MapPoint, actual: MapPoint): number {
  const dx = guess.x - actual.x;
  const dy = guess.y - actual.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Format distance as a readable string
 */
function formatDistance(distance: number | null): string {
  if (distance === null) return 'No guess';
  // Convert percentage distance to feet (1 percentage unit = 2 feet)
  const feet = Math.round(distance * 2);
  if (feet <= 10) return 'Perfect!';
  return `${feet} ft away`;
}

/**
 * Compute the actual rendered bounds of an image using object-fit: contain.
 * Returns the offset and scale as percentages of the container so that
 * image-space percentages (0-100) can be mapped to container-space percentages.
 *
 * containerPct = offsetPct + imagePct * (renderedSize / containerSize) * 100
 */
interface ImageFit {
  offsetXPct: number;   // horizontal offset of image within container (%)
  offsetYPct: number;   // vertical offset of image within container (%)
  scaleX: number;       // rendered image width / container width
  scaleY: number;       // rendered image height / container height
}

function computeContainFit(img: HTMLImageElement): ImageFit {
  const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
  if (!naturalWidth || !naturalHeight || !clientWidth || !clientHeight) {
    return { offsetXPct: 0, offsetYPct: 0, scaleX: 1, scaleY: 1 };
  }

  const containerAR = clientWidth / clientHeight;
  const imageAR = naturalWidth / naturalHeight;

  let renderedW: number;
  let renderedH: number;

  if (imageAR > containerAR) {
    // Image is wider than container — fits width, letterbox top/bottom
    renderedW = clientWidth;
    renderedH = clientWidth / imageAR;
  } else {
    // Image is taller than container — fits height, letterbox left/right
    renderedH = clientHeight;
    renderedW = clientHeight * imageAR;
  }

  const offsetX = (clientWidth - renderedW) / 2;
  const offsetY = (clientHeight - renderedH) / 2;

  return {
    offsetXPct: (offsetX / clientWidth) * 100,
    offsetYPct: (offsetY / clientHeight) * 100,
    scaleX: renderedW / clientWidth,
    scaleY: renderedH / clientHeight,
  };
}

/** Map a point from image-percentage space to container-percentage space. */
function toContainerPct(point: MapPoint, fit: ImageFit): MapPoint {
  return {
    x: fit.offsetXPct + (point.x / 100) * fit.scaleX * 100,
    y: fit.offsetYPct + (point.y / 100) * fit.scaleY * 100,
  };
}

function ResultScreen({
  guessLocation,
  guessFloor,
  actualLocation,
  actualFloor,
  imageUrl,
  locationScore,
  floorCorrect,
  totalScore,
  timeTakenSeconds,
  timedOut,
  noGuess,
  roundNumber,
  totalRounds,
  onNextRound,
  onViewFinalResults,
  isLastRound,
  onBackToTitle
}: ResultScreenProps): React.ReactElement {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const mapOuterRef = useRef<HTMLDivElement>(null);
  const mapImageRef = useRef<HTMLImageElement>(null);
  const [animationPhase, setAnimationPhase] = useState<number>(0);
  const [displayedScore, setDisplayedScore] = useState<number>(0);
  const [imageFit, setImageFit] = useState<ImageFit>({ offsetXPct: 0, offsetYPct: 0, scaleX: 1, scaleY: 1 });
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Sync map container height to match the details panel height
  useEffect(() => {
    const detailsEl = detailsRef.current;
    const mapEl = mapOuterRef.current;
    if (!detailsEl || !mapEl) return;

    const syncHeight = (): void => {
      const detailsHeight = detailsEl.offsetHeight;
      if (detailsHeight > 0) {
        mapEl.style.height = `${detailsHeight}px`;
      }
    };

    // Initial sync
    syncHeight();

    // Re-sync whenever the details panel resizes (e.g. window resize, content change)
    const observer = new ResizeObserver(syncHeight);
    observer.observe(detailsEl);

    return () => observer.disconnect();
  }, []);

  // Recompute image fit whenever the container or image dimensions change
  const updateImageFit = useCallback((): void => {
    const img = mapImageRef.current;
    if (img && img.naturalWidth) {
      setImageFit(computeContainFit(img));
    }
  }, []);

  useEffect(() => {
    const img = mapImageRef.current;
    if (!img) return;

    // Recalculate once the image has loaded
    img.addEventListener('load', updateImageFit);
    // Also recalculate if already cached
    if (img.complete) updateImageFit();

    // Recalculate when the container resizes (height sync, window resize, etc.)
    const observer = new ResizeObserver(updateImageFit);
    observer.observe(img);

    return () => {
      img.removeEventListener('load', updateImageFit);
      observer.disconnect();
    };
  }, [updateImageFit]);

  // Map coordinates from image-space to container-space
  const mappedGuess: MapPoint | null = guessLocation ? toContainerPct(guessLocation, imageFit) : null;
  const mappedActual: MapPoint = toContainerPct(actualLocation, imageFit);

  const {
    scale,
    transformStyle,
    handlers,
    zoomIn,
    zoomOut,
    resetZoom,
    isPanning
  } = useMapZoom(mapContainerRef);

  const isZoomed: boolean = scale > 1;

  const distance: number | null = guessLocation ? calculateDistance(guessLocation, actualLocation) : null;
  const effectiveLocationScore: number = locationScore ?? 0;
  const hasFloorScoring: boolean = guessFloor !== null && actualFloor !== null;
  const isFloorCorrect: boolean = floorCorrect ?? (guessFloor === actualFloor);
  // For display only: 20% penalty when the floor is wrong
  const floorPenalty: number = (hasFloorScoring && !isFloorCorrect) ? Math.round(effectiveLocationScore * 0.2) : 0;

  // Animation sequence
  useEffect(() => {
    // Phase 0: Initial state
    // Phase 1: Show actual location marker
    // Phase 2: Draw line between markers
    // Phase 3: Show score
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setAnimationPhase(1), 300),
      setTimeout(() => setAnimationPhase(2), 800),
      setTimeout(() => setAnimationPhase(3), 1300),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  // Spacebar to advance to next round / final results
  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (isLastRound) {
        onViewFinalResults();
      } else {
        onNextRound();
      }
    }
  }, [isLastRound, onNextRound, onViewFinalResults]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Animate score counter
  useEffect(() => {
    if (animationPhase >= 3) {
      const duration = 1000;
      const steps = 30;
      const increment = (totalScore ?? 0) / steps;
      let current = 0;

      const interval = setInterval(() => {
        current += increment;
        if (current >= (totalScore ?? 0)) {
          setDisplayedScore(totalScore ?? 0);
          clearInterval(interval);
        } else {
          setDisplayedScore(Math.round(current));
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }
  }, [animationPhase, totalScore]);

  return (
    <div className="result-screen">
      {/* Top section - Round info and score */}
      <div className="result-header">
        <div className="round-indicator">
          Round {roundNumber} of {totalRounds}
        </div>
        <div className={`score-display ${animationPhase >= 3 ? 'visible' : ''}`}>
          <span className="score-label">Score</span>
          <span className="score-value">{displayedScore.toLocaleString()}</span>
          <span className="score-max">/ 5,000</span>
        </div>
      </div>

      {noGuess ? (
        <div className="result-banner timeout-banner">
          Time ran out! No guess was made.
        </div>
      ) : timedOut ? (
        <div className="result-banner timeout-banner">
          Time ran out! We locked in your last guess.
        </div>
      ) : null}

      {/* Main content - Map with results */}
      <div className="result-content">
        <div className="result-map-container" ref={mapOuterRef}>
          <div
            className={`result-map ${isZoomed ? 'zoomed' : ''} ${isPanning ? 'is-panning' : ''}`}
            ref={mapContainerRef}
            {...handlers}
          >
            <div
              className="result-zoom-content"
              style={{ transform: transformStyle }}
            >
              {/* Map Image */}
              <img
                className="map-image"
                ref={mapImageRef}
                src="/FINAL_MAP.png"
                alt="Campus Map"
                draggable="false"
                onDragStart={(e: React.DragEvent<HTMLImageElement>) => e.preventDefault()}
              />

              {/* Line between guess and actual (Phase 2+) */}
              {mappedGuess && animationPhase >= 2 && (
                <svg
                  className="result-line-svg"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }}
                >
                  <line
                    className="result-line"
                    x1={`${mappedGuess.x}%`}
                    y1={`${mappedGuess.y}%`}
                    x2={`${mappedActual.x}%`}
                    y2={`${mappedActual.y}%`}
                    stroke="#ffc107"
                    strokeWidth="3"
                    strokeDasharray="8,4"
                  />
                </svg>
              )}

              {/* Guess marker (only when a guess was made) */}
              {mappedGuess && (
                <div
                  className="result-marker guess-marker"
                  style={{
                    left: `${mappedGuess.x}%`,
                    top: `${mappedGuess.y}%`
                  }}
                >
                  <div className="marker-pin guess-pin"></div>
                  <div className="marker-label">Your guess</div>
                </div>
              )}

              {/* Actual location marker (Phase 1+) */}
              {animationPhase >= 1 && (
                <div
                  className="result-marker actual-marker"
                  style={{
                    left: `${mappedActual.x}%`,
                    top: `${mappedActual.y}%`
                  }}
                >
                  <div className="marker-pin actual-pin"></div>
                  <div className="marker-label">Correct</div>
                </div>
              )}
            </div>

            {/* Zoom controls - positioned outside the transform wrapper */}
            <div className="zoom-controls">
              <button
                className="zoom-btn zoom-in-btn"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); zoomIn(); }}
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                className="zoom-btn zoom-out-btn"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); zoomOut(); }}
                title="Zoom out"
                aria-label="Zoom out"
                disabled={!isZoomed}
              >
                -
              </button>
              <button
                className="zoom-btn zoom-reset-btn"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); resetZoom(); }}
                title="Reset zoom"
                aria-label="Reset zoom"
                disabled={!isZoomed}
              >
                &#x21BA;
              </button>
            </div>

            {/* Zoom level indicator */}
            {isZoomed && (
              <div className="zoom-indicator">
                {Math.round(scale * 100)}%
              </div>
            )}
          </div>
        </div>

        {/* Side panel with details */}
        <div className="result-details" ref={detailsRef}>
          <div className="result-image-preview">
            <img src={imageUrl} alt="Location" />
          </div>

          <div className="result-stats">
            <div className="stat-row">
              <span className="stat-icon">📍</span>
              <span className="stat-label">Distance</span>
              <span className="stat-value">{noGuess ? 'No guess' : formatDistance(distance)}</span>
            </div>

            {typeof timeTakenSeconds === 'number' && (
              <div className="stat-row">
                <span className="stat-icon">⏱️</span>
                <span className="stat-label">Time</span>
                <span className="stat-value">
                  {timeTakenSeconds.toFixed(2)}s
                </span>
              </div>
            )}

            {hasFloorScoring && (
              <div className="stat-row">
                <span className="stat-icon">🏢</span>
                <span className="stat-label">Floor</span>
                <span className={`stat-value ${isFloorCorrect ? 'correct' : 'incorrect'}`}>
                  {isFloorCorrect ? (
                    <>Correct! (Floor {actualFloor})</>
                  ) : (
                    <>You: {guessFloor} | Actual: {actualFloor}</>
                  )}
                </span>
              </div>
            )}

            <div className="score-breakdown">
              <div className="breakdown-row">
                <span>Location Score</span>
                <span>{effectiveLocationScore.toLocaleString()}</span>
              </div>
              {floorPenalty > 0 && (
                <div className="breakdown-row penalty">
                  <span>Wrong Floor (-20%)</span>
                  <span>-{floorPenalty.toLocaleString()}</span>
                </div>
              )}
              <div className="breakdown-row total">
                <span>Total</span>
                <span>{totalScore.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="result-actions">
            <button
              className="next-round-button"
              onClick={isLastRound ? onViewFinalResults : onNextRound}
            >
              {isLastRound ? 'View Final Results' : 'Next Round'}
              <span className="button-arrow">→</span>
            </button>
            {onBackToTitle && (
              <button className="leave-game-button" onClick={() => setShowLeaveConfirm(true)}>
                <span className="button-icon">←</span>
                Leave Game
              </button>
            )}
          </div>
        </div>
      </div>

      {showLeaveConfirm && onBackToTitle && (
        <LeaveConfirmModal
          onConfirm={() => {
            setShowLeaveConfirm(false);
            onBackToTitle();
          }}
          onCancel={() => setShowLeaveConfirm(false)}
          isDuel={false}
        />
      )}

      {/* Progress bar */}
      <div className="round-progress">
        {[...Array(totalRounds)].map((_, i) => (
          <div
            key={i}
            className={`progress-dot ${i < roundNumber ? 'completed' : ''} ${i === roundNumber - 1 ? 'current' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

export default ResultScreen;
