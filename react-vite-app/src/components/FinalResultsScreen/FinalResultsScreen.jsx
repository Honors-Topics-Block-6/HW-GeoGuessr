import { useState, useEffect, useMemo } from 'react';
import './FinalResultsScreen.css';

/**
 * Calculate performance rating based on total score
 */
function getPerformanceRating(totalScore, maxPossible) {
  const percentage = (totalScore / maxPossible) * 100;
  if (percentage >= 95) return { rating: 'Perfect!', emoji: '🏆', class: 'perfect' };
  if (percentage >= 80) return { rating: 'Excellent!', emoji: '🌟', class: 'excellent' };
  if (percentage >= 60) return { rating: 'Great!', emoji: '👏', class: 'great' };
  if (percentage >= 40) return { rating: 'Good', emoji: '👍', class: 'good' };
  if (percentage >= 20) return { rating: 'Keep Practicing', emoji: '📍', class: 'okay' };
  return { rating: 'Beginner', emoji: '🎯', class: 'beginner' };
}

const CONFETTI_COLORS = ['#6cb52d', '#ffc107', '#ff4757', '#3498db', '#9b59b6'];

/**
 * Generate confetti data once (outside render to avoid impure calls during render)
 */
function generateConfettiData(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
  }));
}

function FinalResultsScreen({ rounds, onPlayAgain, onBackToTitle }) {
  const [animationComplete, setAnimationComplete] = useState(false);
  const [displayedTotal, setDisplayedTotal] = useState(0);

  const totalScore = rounds.reduce((sum, round) => sum + round.score, 0);
  const maxPossible = rounds.length * 5000;
  const performance = getPerformanceRating(totalScore, maxPossible);

  // Generate confetti data once and memoize it
  const confettiPieces = useMemo(() => generateConfettiData(30), []);

  // Animate total score
  useEffect(() => {
    const duration = 1500;
    const steps = 50;
    const increment = totalScore / steps;
    let current = 0;

    const interval = setInterval(() => {
      current += increment;
      if (current >= totalScore) {
        setDisplayedTotal(totalScore);
        clearInterval(interval);
        setTimeout(() => setAnimationComplete(true), 300);
      } else {
        setDisplayedTotal(Math.round(current));
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [totalScore]);

  return (
    <div className="final-results-screen">
      <div className="final-results-background">
        <div className="confetti-container">
          {animationComplete && performance.class !== 'beginner' && performance.class !== 'okay' && (
            <>
              {confettiPieces.map((piece) => (
                <div
                  key={piece.id}
                  className="confetti"
                  style={{
                    left: piece.left,
                    animationDelay: piece.delay,
                    backgroundColor: piece.color
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <div className="final-results-content">
        {/* Header with performance */}
        <div className="results-hero">
          <div className={`performance-badge ${performance.class}`}>
            <span className="performance-emoji">{performance.emoji}</span>
          </div>
          <h1 className="results-title">Game Complete!</h1>
          <p className={`performance-text ${performance.class}`}>{performance.rating}</p>
        </div>

        {/* Total Score Display */}
        <div className="total-score-container">
          <div className="total-score-box">
            <span className="total-label">Total Score</span>
            <span className="total-value">{displayedTotal.toLocaleString()}</span>
            <span className="total-max">/ {maxPossible.toLocaleString()} points</span>
          </div>
        </div>

        {/* Round by Round Breakdown */}
        <div className="rounds-breakdown">
          <h2 className="breakdown-title">Round Breakdown</h2>
          <div className="rounds-list">
            {rounds.map((round, index) => (
              <div key={index} className="round-item">
                <div className="round-number">Round {index + 1}</div>
                <div className="round-details">
                  <div className="round-image">
                    <img src={round.imageUrl} alt={`Round ${index + 1}`} />
                  </div>
                  <div className="round-stats">
                    <div className="round-stat">
                      <span className="round-stat-label">Location</span>
                      <span className="round-stat-value">{round.locationScore.toLocaleString()}</span>
                    </div>
                    <div className="round-stat">
                      <span className="round-stat-label">Floor</span>
                      <span className={`round-stat-value ${round.floorCorrect ? 'correct' : 'penalty'}`}>
                        {round.floorCorrect ? '✓' : '-20%'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="round-score">
                  <span className="round-score-value">{round.score.toLocaleString()}</span>
                  <span className="round-score-label">pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="final-actions">
          <button className="play-again-button" onClick={onPlayAgain}>
            <span className="button-icon">🔄</span>
            Play Again
          </button>
          <button className="home-button" onClick={onBackToTitle}>
            <span className="button-icon">🏠</span>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default FinalResultsScreen;
