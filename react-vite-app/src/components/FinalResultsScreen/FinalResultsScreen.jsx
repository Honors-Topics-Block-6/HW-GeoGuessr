import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { awardXp } from '../../services/xpService';
import { calculateXpGain, getLevelTitle } from '../../utils/xpLevelling';
import { useDailyGoals } from '../../hooks/useDailyGoals';
import { GOAL_TYPES } from '../../utils/dailyGoalDefinitions';
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

function FinalResultsScreen({ rounds, onPlayAgain, onBackToTitle, difficulty }) {
  const { user, totalXp, refreshUserDoc } = useAuth();
  const { recordProgress } = useDailyGoals(user?.uid);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [displayedTotal, setDisplayedTotal] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const xpAwarded = useRef(false);

  const totalScore = rounds.reduce((sum, round) => sum + round.score, 0);
  const maxPossible = rounds.length * 5000;
  const performance = getPerformanceRating(totalScore, maxPossible);

  // Snapshot the totalXp at mount so it doesn't shift after the Firestore refresh.
  // useState initializer only runs once, so this captures the pre-award value.
  const [snapshotXp] = useState(() => totalXp);

  // Compute XP result from the snapshotted totalXp
  const xpResult = useMemo(
    () => calculateXpGain(snapshotXp, totalScore),
    [snapshotXp, totalScore]
  );

  // Generate confetti data once and memoize it
  const confettiPieces = useMemo(() => generateConfettiData(30), []);

  // Award XP on mount (once per game completion)
  useEffect(() => {
    if (xpAwarded.current || !user) return;
    xpAwarded.current = true;

    // Persist to Firestore, then refresh local user doc
    awardXp(user.uid, totalScore)
      .then(() => refreshUserDoc())
      .catch(err => console.error('Failed to award XP:', err));

    // --- Daily Goals Progress ---
    // Goal: games played (always +1)
    recordProgress(GOAL_TYPES.GAMES_PLAYED, 1);

    // Goal: high score per round (check each round's score)
    for (const round of rounds) {
      if (round.score > 0) {
        recordProgress(GOAL_TYPES.HIGH_SCORE_ROUND, round.score);
      }
      // Goal: correct floor guesses
      if (round.floorCorrect === true) {
        recordProgress(GOAL_TYPES.PERFECT_FLOOR, 1);
      }
    }

    // Goal: high score per game (total score)
    recordProgress(GOAL_TYPES.HIGH_SCORE_GAME, totalScore);

    // Goal: play on specific difficulty
    if (difficulty) {
      recordProgress(GOAL_TYPES.PLAY_DIFFICULTY, 1, { targetDifficulty: difficulty });
    }

    // Show level-up animation after a delay
    if (xpResult.levelsGained > 0) {
      setTimeout(() => setShowLevelUp(true), 2000);
    }
  }, [user, totalScore, refreshUserDoc, xpResult, rounds, difficulty, recordProgress]);

  // Spacebar to play again
  const handleKeyDown = useCallback((e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onPlayAgain();
    }
  }, [onPlayAgain]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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

      {/* Level-Up Overlay */}
      {showLevelUp && xpResult && (
        <div className="level-up-overlay" onClick={() => setShowLevelUp(false)}>
          <div className="level-up-card">
            <div className="level-up-glow"></div>
            <span className="level-up-icon">⬆️</span>
            <h2 className="level-up-title">Level Up!</h2>
            <div className="level-up-levels">
              <span className="level-up-old">Lvl {xpResult.previousLevel}</span>
              <span className="level-up-arrow">→</span>
              <span className="level-up-new">Lvl {xpResult.newLevel}</span>
            </div>
            <p className="level-up-rank">{getLevelTitle(xpResult.newLevel)}</p>
            <button className="level-up-dismiss" onClick={() => setShowLevelUp(false)}>
              Awesome!
            </button>
          </div>
        </div>
      )}

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

        {/* XP Gained Section */}
        {xpResult && (
          <div className="xp-gained-section">
            <div className="xp-gained-box">
              <div className="xp-gained-header">
                <span className="xp-gained-icon">✨</span>
                <span className="xp-gained-label">XP Earned</span>
              </div>
              <span className="xp-gained-value">+{totalScore.toLocaleString()} XP</span>
              <div className="xp-level-info">
                <span className="xp-level-badge">Lvl {xpResult.levelInfo.level}</span>
                <span className="xp-level-title">{getLevelTitle(xpResult.levelInfo.level)}</span>
              </div>
              <div className="xp-progress-bar-container">
                <div className="xp-progress-bar">
                  <div
                    className="xp-progress-fill"
                    style={{ width: `${Math.round(xpResult.levelInfo.progress * 100)}%` }}
                  />
                </div>
                <span className="xp-progress-text">
                  {xpResult.levelInfo.xpIntoLevel.toLocaleString()} / {xpResult.levelInfo.currentLevelXp.toLocaleString()} XP
                </span>
              </div>
            </div>
          </div>
        )}

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
                    {round.noGuess ? (
                      <div className="round-stat">
                        <span className="round-stat-label">No guess</span>
                        <span className="round-stat-value">0</span>
                      </div>
                    ) : (
                      <>
                        <div className="round-stat">
                          <span className="round-stat-label">Location</span>
                          <span className="round-stat-value">{round.locationScore.toLocaleString()}</span>
                        </div>
                        {round.floorCorrect !== null && (
                          <div className="round-stat">
                            <span className="round-stat-label">Floor</span>
                            <span className={`round-stat-value ${round.floorCorrect ? 'correct' : 'penalty'}`}>
                              {round.floorCorrect ? '✓' : '-20%'}
                            </span>
                          </div>
                        )}
                      </>
                    )}
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
