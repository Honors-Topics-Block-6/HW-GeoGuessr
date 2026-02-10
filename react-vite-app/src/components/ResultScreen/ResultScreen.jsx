import { useRef, useEffect, useState } from 'react';
import useMapZoom from '../../hooks/useMapZoom';
import './ResultScreen.css';

/**
 * Calculate distance between two points (in percentage coordinates)
 * Returns distance as a percentage of the map diagonal
 */
function calculateDistance(guess, actual) {
  const dx = guess.x - actual.x;
  const dy = guess.y - actual.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate score based on distance (0-5000 points per round, GeoGuessr style)
 * Perfect guess = 5000 points
 * Score decreases exponentially with distance
 */
function calculateScore(distance) {
  // Max distance on a 100x100 grid is ~141 (diagonal)
  // Use exponential decay for scoring
  const maxScore = 5000;
  const decayRate = 0.05; // Adjust for difficulty
  const score = Math.round(maxScore * Math.exp(-decayRate * distance));
  return Math.max(0, Math.min(maxScore, score));
}

/**
 * Format distance as a readable string
 */
function formatDistance(distance) {
  // Convert percentage distance to approximate "units" for display
  // In a real campus, this might be meters or feet
  const units = Math.round(distance * 2); // Arbitrary scaling
  if (units < 5) return 'Perfect!';
  if (units < 20) return `${units} ft away`;
  return `${units} ft away`;
}

function ResultScreen({
  guessLocation,
  guessFloor,
  actualLocation,
  actualFloor,
  imageUrl,
  roundNumber,
  totalRounds,
  onNextRound,
  onViewFinalResults,
  isLastRound
}) {
  const mapContainerRef = useRef(null);
  const [animationPhase, setAnimationPhase] = useState(0);
  const [displayedScore, setDisplayedScore] = useState(0);

  const {
    scale,
    transformStyle,
    handlers,
    zoomIn,
    zoomOut,
    resetZoom
  } = useMapZoom(mapContainerRef);

  const isZoomed = scale > 1;

  const distance = calculateDistance(guessLocation, actualLocation);
  const locationScore = calculateScore(distance);
  const floorCorrect = guessFloor === actualFloor;
  // Multiply by 0.8 for incorrect floor
  const totalScore = floorCorrect ? locationScore : Math.round(locationScore * 0.8);
  const floorPenalty = floorCorrect ? 0 : Math.round(locationScore * 0.2);

  // Animation sequence
  useEffect(() => {
    // Phase 0: Initial state
    // Phase 1: Show actual location marker
    // Phase 2: Draw line between markers
    // Phase 3: Show score
    const timers = [
      setTimeout(() => setAnimationPhase(1), 300),
      setTimeout(() => setAnimationPhase(2), 800),
      setTimeout(() => setAnimationPhase(3), 1300),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  // Animate score counter
  useEffect(() => {
    if (animationPhase >= 3) {
      const duration = 1000;
      const steps = 30;
      const increment = totalScore / steps;
      let current = 0;

      const interval = setInterval(() => {
        current += increment;
        if (current >= totalScore) {
          setDisplayedScore(totalScore);
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

      {/* Main content - Map with results */}
      <div className="result-content">
        <div className="result-map-container">
          <div
            className={`result-map ${isZoomed ? 'zoomed' : ''}`}
            ref={mapContainerRef}
            onMouseDown={handlers.onMouseDown}
            onMouseMove={handlers.onMouseMove}
            onMouseUp={handlers.onMouseUp}
            onMouseLeave={handlers.onMouseLeave}
            onTouchStart={handlers.onTouchStart}
            onTouchMove={handlers.onTouchMove}
            onTouchEnd={handlers.onTouchEnd}
          >
            <div
              className="result-zoom-content"
              style={{ transform: transformStyle }}
            >
              {/* Map Image */}
              <img
                className="map-image"
                src="/map.png"
                alt="Campus Map"
              />

              {/* Line between guess and actual (Phase 2+) */}
              {animationPhase >= 2 && (
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

              {/* Guess marker (always visible) */}
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
                onClick={(e) => { e.stopPropagation(); zoomIn(); }}
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                className="zoom-btn zoom-out-btn"
                onClick={(e) => { e.stopPropagation(); zoomOut(); }}
                title="Zoom out"
                aria-label="Zoom out"
                disabled={!isZoomed}
              >
                -
              </button>
              <button
                className="zoom-btn zoom-reset-btn"
                onClick={(e) => { e.stopPropagation(); resetZoom(); }}
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
        <div className="result-details">
          <div className="result-image-preview">
            <img src={imageUrl} alt="Location" />
          </div>

          <div className="result-stats">
            <div className="stat-row">
              <span className="stat-icon">📍</span>
              <span className="stat-label">Distance</span>
              <span className="stat-value">{formatDistance(distance)}</span>
            </div>

            <div className="stat-row">
              <span className="stat-icon">🏢</span>
              <span className="stat-label">Floor</span>
              <span className={`stat-value ${guessFloor === actualFloor ? 'correct' : 'incorrect'}`}>
                {guessFloor === actualFloor ? (
                  <>Correct! (Floor {actualFloor})</>
                ) : (
                  <>You: {guessFloor} | Actual: {actualFloor}</>
                )}
              </span>
            </div>

            <div className="score-breakdown">
              <div className="breakdown-row">
                <span>Location Score</span>
                <span>{locationScore.toLocaleString()}</span>
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
