import './DailyGoalsCard.css';

function GoalRow({ icon, label, detail, status }) {
  return (
    <div className={`daily-goal-row ${status}`}>
      <div className="goal-icon">{icon}</div>
      <div className="goal-content">
        <div className="goal-label">{label}</div>
        {detail && <div className="goal-detail">{detail}</div>}
      </div>
      <div className="goal-status">
        {status === 'completed' ? '✓' : ''}
      </div>
    </div>
  );
}

function formatProgress(current = 0, target = 0) {
  return `${current}/${target}`;
}

function resolveFirstLocationDetail(details) {
  if (!details) {
    return 'Be the first to guess today’s featured location.';
  }

  if (details.description) {
    return `Be the first to guess: ${details.description}`;
  }

  return 'Be the first to guess the featured location.';
}

export default function DailyGoalsCard({
  loading,
  error,
  goalDateLabel,
  goals,
  progress,
  firstLocationDetails,
  playerId,
  variant = 'full'
}) {
  const cardClass = `daily-goals-card daily-goals-card--${variant}`;

  if (loading) {
    return (
      <div className={cardClass} aria-live="polite">
        <div className="daily-goals-header">
          <span className="header-title">Daily Goals</span>
          {goalDateLabel && <span className="header-date">{goalDateLabel}</span>}
        </div>
        <div className="daily-goals-loading">Loading goals…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cardClass} role="status">
        <div className="daily-goals-header">
          <span className="header-title">Daily Goals</span>
        </div>
        <div className="daily-goals-error">{error}</div>
      </div>
    );
  }

  if (!goals || !progress) {
    return null;
  }

  const indoorTarget = goals.indoorTarget ?? 0;
  const outdoorTarget = goals.outdoorTarget ?? 0;
  const indoorCompleted = Boolean(progress.indoorCompleted);
  const outdoorCompleted = Boolean(progress.outdoorCompleted);
  const firstComplete = Boolean(progress.firstLocationCompleted);
  const isFirstWinner = goals.firstWinner?.playerId && goals.firstWinner.playerId === playerId;
  const firstClaimed = Boolean(goals.firstWinner?.playerId);
  const firstStatus = firstComplete || isFirstWinner || firstClaimed ? 'completed' : 'active';

  const firstDetail = firstClaimed
    ? isFirstWinner
      ? 'You claimed the featured location!'
      : 'Already claimed by another player.'
    : resolveFirstLocationDetail(firstLocationDetails);

  return (
    <div className={cardClass}>
      <div className="daily-goals-header">
        <span className="header-title">Daily Goals</span>
        {goalDateLabel && <span className="header-date">{goalDateLabel}</span>}
      </div>
      <div className="daily-goals-body">
        <GoalRow
          icon="🏠"
          label="Indoor Explorer"
          detail={
            indoorTarget > 0
              ? `Correct indoor guesses: ${formatProgress(progress.indoorCount, indoorTarget)}`
              : 'No indoor goal today.'
          }
          status={indoorCompleted ? 'completed' : 'active'}
        />
        <GoalRow
          icon="🌤️"
          label="Outdoor Adventurer"
          detail={
            outdoorTarget > 0
              ? `Correct outdoor guesses: ${formatProgress(progress.outdoorCount, outdoorTarget)}`
              : 'No outdoor goal today.'
          }
          status={outdoorCompleted ? 'completed' : 'active'}
        />
        <GoalRow
          icon="⚡"
          label="First Finder"
          detail={firstDetail}
          status={firstStatus}
        />
      </div>
    </div>
  );
}
