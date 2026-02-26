import { useMemo } from 'react';
import './DailyGoalsCompletionModal.css';

export interface DailyGoalsCompletionModalProps {
  bonusXpAmount: number;
  collecting: boolean;
  onCollect: () => void;
  onClose: () => void;
}

function DailyGoalsCompletionModal({
  bonusXpAmount,
  collecting,
  onCollect,
  onClose
}: DailyGoalsCompletionModalProps): React.ReactElement {
  const confettiPieces = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 1.6}s`,
      color: ['#ffc107', '#6cb52d', '#ff6b6b', '#4dabf7', '#c77dff'][i % 5]
    })),
    []
  );

  return (
    <div className="daily-goals-reward-modal-overlay" role="dialog" aria-modal="true" aria-label="Daily goals completed">
      <div className="daily-goals-reward-confetti">
        {confettiPieces.map((piece) => (
          <span
            key={piece.id}
            className="daily-goals-confetti-piece"
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              backgroundColor: piece.color
            }}
          />
        ))}
      </div>

      <div className="daily-goals-reward-modal">
        <button className="daily-goals-reward-close" onClick={onClose} aria-label="Close reward popup">
          ×
        </button>
        <div className="daily-goals-reward-icon">🎉</div>
        <h2>Daily Goals Complete!</h2>
        <p>You finished all goals today. Great work!</p>
        <button
          className="daily-goals-reward-collect-btn"
          onClick={onCollect}
          disabled={collecting}
        >
          {collecting ? 'Collecting...' : `Collect ${bonusXpAmount.toLocaleString()} XP`}
        </button>
      </div>
    </div>
  );
}

export default DailyGoalsCompletionModal;
