import { useRef, useEffect, useState } from 'react';
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
  locationScore,
  floorCorrect,
  totalScore,
  timeTakenSeconds,
  timeMultiplier,
  timedOut,
  roundNumber,
  totalRounds,
  onNextRound,
  onViewFinalResults,
  isLastRound
}) {
  const mapRef = useRef(null);
  const [animationPhase, setAnimationPhase] = useState(0);
  const [displayedScore, setDisplayedScore] = useState(0);

  const distance = calculateDistance(guessLocation, actualLocation);
  const effectiveLocationScore = locationScore ?? 0;
  const isFloorCorrect = floorCorrect ?? (guessFloor === actualFloor);
  // For display only: 20% penalty when the floor is wrong
  const floorPenalty = isFloorCorrect ? 0 : Math.round(effectiveLocationScore * 0.2);

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

      {timedOut && (
        <div className="result-banner timeout-banner">
          Time ran out! We locked in your last guess.
        </div>
      )}

      {/* Main content - Map with results */}
      <div className="result-content">
        <div className="result-map-container">
          <div className="result-map" ref={mapRef}>
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

              {typeof timeTakenSeconds === 'number' && (
                <div className="stat-row">
                  <span className="stat-icon">⏱️</span>
                  <span className="stat-label">Time</span>
                  <span className="stat-value">
                    {timeTakenSeconds.toFixed(2)}s
                    {typeof timeMultiplier === 'number' && (
                      <> ({Math.round(timeMultiplier * 100)}% of distance score)</>
                    )}
                  </span>
                </div>
              )}

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
