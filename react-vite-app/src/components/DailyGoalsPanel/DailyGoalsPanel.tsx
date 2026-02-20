import { useEffect, useState } from 'react';
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

  // Keep header/profile stats in sync when goals change
  useEffect(() => {
    if (!user?.uid) return;
    void refreshUserDoc();
  }, [user?.uid, allCompleted, bonusXpAwarded, refreshUserDoc]);

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
  const totalGoals = (goals as DailyGoal[]).length;
  const remainingGoals = Math.max(totalGoals - completedCount, 0);
  const progressPercent = totalGoals > 0 ? Math.round((completedCount / totalGoals) * 100) : 0;
  const progressEmoji = completedCount === totalGoals && totalGoals > 0 ? '🎉' : completedCount > 0 ? '🔥' : '🚀';

  const progressHeadline = completedCount === totalGoals && totalGoals > 0
    ? 'All goals crushed!'
    : completedCount > 0
      ? 'Momentum unlocked!'
      : 'Adventure awaits!';

  const motivationCopy = completedCount === totalGoals && totalGoals > 0
    ? 'You cleared every mission for today. Bask in that victory glow!'
    : completedCount > 0
      ? `Only ${remainingGoals} more ${remainingGoals === 1 ? 'goal' : 'goals'} until bonus XP riches. Keep the streak alive!`
      : 'Kick things off with any goal below to start your XP streak.';

  return (
    <div className="daily-goals-panel">
      <div className="daily-goals-background">
        <div className="daily-goals-overlay"></div>
      </div>
      <div className="daily-goals-card">
        <button className="daily-goals-back-button" onClick={onBack}>
          &larr; Back
        </button>

        <h1 className="daily-goals-title">
          Daily Goals <span className="daily-goals-title-emoji">🎯</span>
        </h1>
        <p className="daily-goals-subtitle">
          Complete all goals to earn {bonusXpAmount.toLocaleString()} bonus XP!
        </p>

        <div className="daily-goals-hype-card">
          <span className="daily-goals-hype-emoji" role="img" aria-hidden="true">{progressEmoji}</span>
          <div className="daily-goals-hype-copy">
            <span className="daily-goals-hype-headline">{progressHeadline}</span>
            <span className="daily-goals-hype-subline">{motivationCopy}</span>
          </div>
        </div>

        {/* Progress summary */}
        <div className="daily-goals-progress-summary">
          <div className="daily-goals-progress-meta">
            <span className="daily-goals-progress-pill">
              {completedCount}/{totalGoals || 0} completed
            </span>
            <span className="daily-goals-progress-percent">{progressPercent}%</span>
          </div>
          <div className="daily-goals-progress-bar">
            <div
              className="daily-goals-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="daily-goals-progress-text">
            {completedCount} / {totalGoals || 0} completed
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
                <div
                  className="daily-goal-check"
                  role="img"
                  aria-label={goal.completed ? 'Goal completed' : 'Goal in progress'}
                >
                  {goal.completed ? '✅' : '✨'}
                </div>
                <div className="daily-goal-info">
                  <span className="daily-goal-description">
                    {goal.completed ? 'Completed · ' : 'Objective · '}
                    <span className="daily-goal-description-text">{goal.description}</span>
                  </span>
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
                    {!goal.completed && (
                      <span className="daily-goal-progress-spark">
                        {goal.isThreshold ? ' ⚡ Keep pushing!' : ' 💪 You got this!'}
                      </span>
                    )}
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
