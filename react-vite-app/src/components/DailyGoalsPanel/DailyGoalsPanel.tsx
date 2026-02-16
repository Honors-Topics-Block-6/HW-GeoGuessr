import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDailyGoals } from '../../hooks/useDailyGoals';
import './DailyGoalsPanel.css';

interface DailyGoal {
  id: string;
  description: string;
  completed: boolean;
  current: number;
  target: number;
  isThreshold?: boolean;
}

export interface DailyGoalsPanelProps {
  onBack: () => void;
}

function DailyGoalsPanel({ onBack }: DailyGoalsPanelProps): React.ReactElement {
  const { user, refreshUserDoc } = useAuth();
  const {
    goals,
    allCompleted,
    bonusXpAwarded,
    bonusXpAmount,
    loading,
    error,
    claimBonusXp
  } = useDailyGoals(user?.uid ?? null);

  const [claiming, setClaiming] = useState<boolean>(false);
  const [claimed, setClaimed] = useState<boolean>(false);

  const handleClaimBonus = async (): Promise<void> => {
    setClaiming(true);
    try {
      await claimBonusXp();
      await refreshUserDoc();
      setClaimed(true);
    } catch (err) {
      console.error('Claim failed:', err);
    } finally {
      setClaiming(false);
    }
  };

  const completedCount = (goals as DailyGoal[]).filter((g: DailyGoal) => g.completed).length;

  return (
    <div className="daily-goals-panel">
      <div className="daily-goals-background">
        <div className="daily-goals-overlay"></div>
      </div>
      <div className="daily-goals-card">
        <button className="daily-goals-back-button" onClick={onBack}>
          &larr; Back
        </button>

        <h1 className="daily-goals-title">Daily Goals</h1>
        <p className="daily-goals-subtitle">
          Complete all goals to earn {bonusXpAmount.toLocaleString()} bonus XP!
        </p>

        {/* Progress summary */}
        <div className="daily-goals-progress-summary">
          <div className="daily-goals-progress-bar">
            <div
              className="daily-goals-progress-fill"
              style={{ width: `${(goals as DailyGoal[]).length > 0 ? (completedCount / (goals as DailyGoal[]).length) * 100 : 0}%` }}
            />
          </div>
          <span className="daily-goals-progress-text">
            {completedCount} / {(goals as DailyGoal[]).length} completed
          </span>
        </div>

        {error && <div className="daily-goals-error">{error}</div>}

        {loading ? (
          <div className="daily-goals-loading">Loading goals...</div>
        ) : (
          <div className="daily-goals-list">
            {(goals as DailyGoal[]).map((goal: DailyGoal) => (
              <div
                key={goal.id}
                className={`daily-goal-item ${goal.completed ? 'completed' : ''}`}
              >
                <div className="daily-goal-check">
                  {goal.completed ? '\u2705' : '\u2B1C'}
                </div>
                <div className="daily-goal-info">
                  <span className="daily-goal-description">{goal.description}</span>
                  <div className="daily-goal-progress-bar">
                    <div
                      className="daily-goal-progress-fill"
                      style={{
                        width: `${Math.min(100, (goal.current / goal.target) * 100)}%`
                      }}
                    />
                  </div>
                  <span className="daily-goal-progress-text">
                    {goal.isThreshold
                      ? `Best: ${goal.current.toLocaleString()} / ${goal.target.toLocaleString()}`
                      : `${Math.min(goal.current, goal.target)} / ${goal.target}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bonus section */}
        {allCompleted && (
          <div className="daily-goals-bonus-section">
            {bonusXpAwarded || claimed ? (
              <div className="daily-goals-bonus-claimed">
                <span className="bonus-claimed-icon">{'\uD83C\uDF89'}</span>
                <span>+{bonusXpAmount.toLocaleString()} XP Claimed!</span>
              </div>
            ) : (
              <button
                className="daily-goals-claim-button"
                onClick={handleClaimBonus}
                disabled={claiming}
              >
                {claiming ? 'Claiming...' : `Claim ${bonusXpAmount.toLocaleString()} Bonus XP`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DailyGoalsPanel;
