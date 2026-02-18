import { useRef, useEffect, useState, useCallback } from 'react';
import useMapZoom from '../../hooks/useMapZoom';
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
  /** Points deducted due to time (hard mode) */
  timePenalty?: number;
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
  timePenalty
}: ResultScreenProps): React.ReactElement {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const mapOuterRef = useRef<HTMLDivElement>(null);
  const [animationPhase, setAnimationPhase] = useState<number>(0);
  const [displayedScore, setDisplayedScore] = useState<number>(0);

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
                src="/FINAL_MAP.png"
                alt="Campus Map"
                draggable="false"
                onDragStart={(e: React.DragEvent<HTMLImageElement>) => e.preventDefault()}
              />

              {/* Line between guess and actual (Phase 2+) */}
              {guessLocation && animationPhase >= 2 && (
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
                    x1={`${guessLocation.x}%`}
                    y1={`${guessLocation.y}%`}
                    x2={`${actualLocation.x}%`}
                    y2={`${actualLocation.y}%`}
                    stroke="#ffc107"
                    strokeWidth="3"
                    strokeDasharray="8,4"
                  />
                </svg>
              )}

              {/* Guess marker (only when a guess was made) */}
              {guessLocation && (
                <div
                  className="result-marker guess-marker"
                  style={{
                    left: `${guessLocation.x}%`,
                    top: `${guessLocation.y}%`
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
                    left: `${actualLocation.x}%`,
                    top: `${actualLocation.y}%`
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
              {(timePenalty ?? 0) > 0 && (
                <div className="breakdown-row penalty">
                  <span>Time Penalty</span>
                  <span>-{(timePenalty ?? 0).toLocaleString()}</span>
                </div>
              )}
              {floorPenalty > 0 && (
                <div className="breakdown-row penalty">
                  <span>Wrong Floor (-20%)</span>
                  <span>-{floorPenalty.toLocaleString()}</span>
                </div>
              )}
              <div className="breakdown-row total">
                <span>Score</span>
                <span>{totalScore.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <button
            className="next-round-button"
            onClick={isLastRound ? onViewFinalResults : onNextRound}
          >
            {isLastRound ? 'View Final Results' : 'Next Round'}
            <span className="button-arrow">→</span>
          </button>
        </div>
      </div>

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
