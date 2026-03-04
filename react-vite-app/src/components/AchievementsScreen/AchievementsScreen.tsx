import { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllAchievementMeta, isAchievementUnlocked, type AchievementId } from '../../services/achievementService';
import './AchievementsScreen.css';

export interface AchievementsScreenProps {
  onBack: () => void;
}

interface AchievementDefinition {
  id: AchievementId;
  icon: string;
  title: string;
  highlight: string;
  details: string;
  xpReward: number;
  target: number;
  progress: number;
  unlocked: boolean;
}

function AchievementsScreen({ onBack }: AchievementsScreenProps): React.ReactElement {
  const { userDoc, totalXp, levelInfo, emailVerified } = useAuth();

  const gamesPlayed: number = userDoc?.gamesPlayed ?? 0;
  const achievementDefinitions: AchievementDefinition[] = useMemo(() => {
    const allMeta = getAllAchievementMeta();
    return allMeta.map((meta) => {
      let target = 1;
      let progress = 0;

      if (meta.id === 'first-game') {
        target = 1;
        progress = gamesPlayed;
      } else if (meta.id === 'weekend-warrior') {
        target = 25;
        progress = gamesPlayed;
      } else if (meta.id === 'xp-collector') {
        target = 5000;
        progress = totalXp;
      } else if (meta.id === 'rising-star') {
        target = 10;
        progress = levelInfo.level;
      } else if (meta.id === 'verified-account') {
        target = 1;
        progress = emailVerified ? 1 : 0;
      } else if (
        meta.id === 'easy-finish' ||
        meta.id === 'medium-finish' ||
        meta.id === 'hard-finish' ||
        meta.id === 'bullseye'
      ) {
        target = 1;
        progress = isAchievementUnlocked(meta.id) ? 1 : 0;
      }

      const clampedProgress = Math.min(progress, target);
      return {
        ...meta,
        target,
        progress: clampedProgress,
        unlocked: clampedProgress >= target
      };
    });
  }, [emailVerified, gamesPlayed, levelInfo.level, totalXp]);

  const completedAchievements: number = achievementDefinitions.filter((achievement) => achievement.progress >= achievement.target).length;

  return (
    <div className="achievements-screen">
      <div className="achievements-background">
        <div className="achievements-overlay"></div>
      </div>
      <div className="achievements-card">
        <div className="achievements-card-top">
          <button className="achievements-back-button" onClick={onBack}>
            ← Back
          </button>
        </div>

        <div className="achievements-header">
          <div>
            <h1 className="achievements-title">Achievements</h1>
            <p className="achievements-subtitle">Keep playing to unlock more XP rewards.</p>
          </div>
          <div className="achievements-summary-chip">
            {completedAchievements}/{achievementDefinitions.length} unlocked
          </div>
        </div>

        <div className="achievements-meta">
          <div className="achievements-meta-item">
            <span className="achievements-meta-label">Level</span>
            <span className="achievements-meta-value">{levelInfo.level}</span>
          </div>
          <div className="achievements-meta-item">
            <span className="achievements-meta-label">Total XP</span>
            <span className="achievements-meta-value">{(userDoc?.totalXp ?? 0).toLocaleString()}</span>
          </div>
          <div className="achievements-meta-item">
            <span className="achievements-meta-label">Games Played</span>
            <span className="achievements-meta-value">{gamesPlayed}</span>
          </div>
          <div className="achievements-meta-item">
            <span className="achievements-meta-label">Email Verified</span>
            <span className={`achievements-meta-pill ${emailVerified ? 'yes' : 'no'}`}>
              {emailVerified ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        <div className="achievements-grid">
          {achievementDefinitions.map((achievement) => {
            const isUnlocked = achievement.unlocked;
            const progressPercent = Math.round((achievement.progress / achievement.target) * 100);

            return (
              <div
                key={achievement.id}
                className={`achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`}
              >
                <div className="achievement-card-header">
                  <div className={`achievement-icon-circle ${isUnlocked ? 'unlocked' : 'locked'}`}>
                    <span className="achievement-icon">{achievement.icon}</span>
                  </div>
                  <div className="achievement-main">
                    <span className="achievement-title">{achievement.title}</span>
                    <span className="achievement-reward">+{achievement.xpReward.toLocaleString()} XP</span>
                  </div>
                  <span className={`achievement-status ${isUnlocked ? 'unlocked' : 'locked'}`}>
                    {isUnlocked ? 'Unlocked' : 'Locked'}
                  </span>
                </div>
                <div className="achievement-progress-row">
                  <div className="achievement-progress-track">
                    <div className="achievement-progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <span className="achievement-progress">
                    {achievement.progress.toLocaleString()} / {achievement.target.toLocaleString()}
                  </span>
                </div>
                <div className="achievement-hover-card" role="tooltip">
                  <p>
                    <strong>{achievement.highlight}</strong> {achievement.details}
                  </p>
                  <p className="achievement-hover-reward">
                    XP Bonus: +{achievement.xpReward.toLocaleString()} XP
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AchievementsScreen;
