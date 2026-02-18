import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ACHIEVEMENTS_UPDATED_EVENT, getAchievementFlags } from '../../services/achievementService';
import './ProfileScreen.css';

export interface ProfileScreenProps {
  onBack: () => void;
  onOpenFriends: () => void;
}

interface AchievementDefinition {
  id: string;
  icon: string;
  title: string;
  description: string;
  target: number;
  progress: number;
}

function ProfileScreen({ onBack, onOpenFriends }: ProfileScreenProps): React.ReactElement {
  const { user, userDoc, updateUsername, totalXp, levelInfo, levelTitle, emailVerified } = useAuth();

  const [newUsername, setNewUsername] = useState<string>(userDoc?.username || '');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [achievementFlags, setAchievementFlags] = useState(() => getAchievementFlags());
  const [achievementQueue, setAchievementQueue] = useState<AchievementDefinition[]>([]);
  const [activeAchievement, setActiveAchievement] = useState<AchievementDefinition | null>(null);
  const previousUnlockedIdsRef = useRef<Set<string> | null>(null);

  const handleSave = async (): Promise<void> => {
    setError('');
    setSuccess('');

    const trimmed = newUsername.trim();
    if (!trimmed) {
      setError('Username cannot be empty.');
      return;
    }
    if (trimmed.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (trimmed === userDoc?.username) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateUsername(trimmed);
      setSuccess('Username updated successfully!');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError((err as Error).message || 'Failed to update username.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = (): void => {
    setNewUsername(userDoc?.username || '');
    setIsEditing(false);
    setError('');
  };

  const progressPercent: number = Math.round(levelInfo.progress * 100);
  const gamesPlayed: number = userDoc?.gamesPlayed ?? 0;

  useEffect(() => {
    const syncAchievementFlags = (): void => setAchievementFlags(getAchievementFlags());
    window.addEventListener(ACHIEVEMENTS_UPDATED_EVENT, syncAchievementFlags);
    window.addEventListener('storage', syncAchievementFlags);
    return () => {
      window.removeEventListener(ACHIEVEMENTS_UPDATED_EVENT, syncAchievementFlags);
      window.removeEventListener('storage', syncAchievementFlags);
    };
  }, []);

  const achievementDefinitions: AchievementDefinition[] = useMemo(() => [
    {
      id: 'first-game',
      icon: '🧭',
      title: 'First Steps',
      description: 'Play your first game.',
      target: 1,
      progress: gamesPlayed
    },
    {
      id: 'weekend-warrior',
      icon: '🎯',
      title: 'Weekend Warrior',
      description: 'Play 25 games.',
      target: 25,
      progress: gamesPlayed
    },
    {
      id: 'xp-collector',
      icon: '⚡',
      title: 'XP Collector',
      description: 'Earn 5,000 total XP.',
      target: 5000,
      progress: totalXp
    },
    {
      id: 'rising-star',
      icon: '⭐',
      title: 'Rising Star',
      description: 'Reach level 10.',
      target: 10,
      progress: levelInfo.level
    },
    {
      id: 'verified-account',
      icon: '✅',
      title: 'Verified Account',
      description: 'Verify your email address.',
      target: 1,
      progress: emailVerified ? 1 : 0
    },
    {
      id: 'test-achievement',
      icon: '🧪',
      title: 'QA Toggle',
      description: 'Unlocked with the test button on the home page.',
      target: 1,
      progress: achievementFlags.testUnlocked ? 1 : 0
    },
    {
      id: 'easy-finish',
      icon: '🟢',
      title: 'Easy Clear',
      description: 'Finish a full game on Easy difficulty.',
      target: 1,
      progress: achievementFlags.difficulties.easy ? 1 : 0
    },
    {
      id: 'medium-finish',
      icon: '🟡',
      title: 'Medium Clear',
      description: 'Finish a full game on Medium difficulty.',
      target: 1,
      progress: achievementFlags.difficulties.medium ? 1 : 0
    },
    {
      id: 'hard-finish',
      icon: '🔴',
      title: 'Hard Clear',
      description: 'Finish a full game on Hard difficulty.',
      target: 1,
      progress: achievementFlags.difficulties.hard ? 1 : 0
    }
  ], [achievementFlags, emailVerified, gamesPlayed, levelInfo.level, totalXp]);
  const completedAchievements: number = achievementDefinitions.filter((achievement) => achievement.progress >= achievement.target).length;
  const unlockedIds = useMemo(
    () => achievementDefinitions.filter((achievement) => achievement.progress >= achievement.target).map((achievement) => achievement.id),
    [achievementDefinitions]
  );

  useEffect(() => {
    const unlockedNow = new Set(unlockedIds);
    if (previousUnlockedIdsRef.current === null) {
      previousUnlockedIdsRef.current = unlockedNow;
      return;
    }

    const newlyUnlocked = achievementDefinitions.filter(
      (achievement) => unlockedNow.has(achievement.id) && !previousUnlockedIdsRef.current?.has(achievement.id)
    );

    if (newlyUnlocked.length > 0) {
      setAchievementQueue((previous) => [...previous, ...newlyUnlocked]);
    }

    previousUnlockedIdsRef.current = unlockedNow;
  }, [achievementDefinitions, unlockedIds]);

  useEffect(() => {
    if (activeAchievement || achievementQueue.length === 0) return;
    const [nextAchievement, ...restQueue] = achievementQueue;
    setActiveAchievement(nextAchievement);
    setAchievementQueue(restQueue);
  }, [activeAchievement, achievementQueue]);

  useEffect(() => {
    if (!activeAchievement) return;
    const timer = window.setTimeout(() => {
      setActiveAchievement(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [activeAchievement]);

  return (
    <div className="profile-screen">
      {activeAchievement && (
        <div className="profile-achievement-toast" role="status" aria-live="polite">
          <div className="profile-achievement-toast-badge">{activeAchievement.icon}</div>
          <div className="profile-achievement-toast-text">
            <div className="profile-achievement-toast-title">Achievement Unlocked: {activeAchievement.title}</div>
            <div className="profile-achievement-toast-description">{activeAchievement.description}</div>
          </div>
        </div>
      )}
      <div className="profile-background">
        <div className="profile-overlay"></div>
      </div>
      <div className="profile-card">
        <button className="profile-back-button" onClick={onBack}>
          ← Back
        </button>

        <div className="profile-avatar">
          <span className="profile-avatar-icon">👤</span>
        </div>

        <h1 className="profile-title">Your Profile</h1>

        {error && <div className="profile-error">{error}</div>}
        {success && <div className="profile-success">{success}</div>}

        {/* ── Level & XP Section ── */}
        <div className="profile-level-section">
          <div className="profile-level-header">
            <span className="profile-level-badge">Lvl {levelInfo.level}</span>
            <span className="profile-level-title">{levelTitle}</span>
          </div>

          <div className="profile-xp-bar-container">
            <div className="profile-xp-bar">
              <div
                className="profile-xp-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="profile-xp-bar-labels">
              <span className="profile-xp-current">
                {levelInfo.xpIntoLevel.toLocaleString()} XP
              </span>
              <span className="profile-xp-needed">
                {levelInfo.currentLevelXp.toLocaleString()} XP
              </span>
            </div>
          </div>

          <div className="profile-xp-stats">
            <div className="profile-xp-stat">
              <span className="profile-xp-stat-value">{totalXp.toLocaleString()}</span>
              <span className="profile-xp-stat-label">Total XP</span>
            </div>
            <div className="profile-xp-stat">
              <span className="profile-xp-stat-value">{gamesPlayed}</span>
              <span className="profile-xp-stat-label">Games Played</span>
            </div>
            <div className="profile-xp-stat">
              <span className="profile-xp-stat-value">{levelInfo.xpToNextLevel.toLocaleString()}</span>
              <span className="profile-xp-stat-label">XP to Next Level</span>
            </div>
          </div>
        </div>

        <div className="profile-fields">
          <div className="profile-field">
            <span className="profile-label">Achievements</span>
            <div className="profile-achievements-header">
              <span className="profile-achievements-summary">
                {completedAchievements}/{achievementDefinitions.length} unlocked
              </span>
            </div>
            <div className="profile-achievements-strip">
              {achievementDefinitions.map((achievement) => {
                const isUnlocked = achievement.progress >= achievement.target;
                const clampedProgress = Math.min(achievement.progress, achievement.target);

                return (
                  <div
                    key={achievement.id}
                    className={`profile-achievement-chip ${isUnlocked ? 'unlocked' : 'locked'}`}
                    title={achievement.description}
                  >
                    <div className={`profile-achievement-circle ${isUnlocked ? 'unlocked' : 'locked'}`}>
                      <span className="profile-achievement-icon">{achievement.icon}</span>
                    </div>
                    <span className="profile-achievement-title">{achievement.title}</span>
                    <div className="profile-achievement-progress">
                      {clampedProgress.toLocaleString()} / {achievement.target.toLocaleString()}
                    </div>
                    <div className="profile-achievement-hover-card" role="tooltip">
                      {achievement.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="profile-field">
            <span className="profile-label">Username</span>
            {isEditing ? (
              <div className="profile-edit-row">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value)}
                  className="profile-input"
                  autoFocus
                  disabled={isSaving}
                />
                <button
                  className="profile-save-button"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="profile-cancel-button"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="profile-value-row">
                <span className="profile-value">{userDoc?.username}</span>
                <button
                  className="profile-edit-button"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          <div className="profile-field">
            <span className="profile-label">Email</span>
            <div className="profile-value-row">
              <span className="profile-value">{user?.email}</span>
              <span className={`profile-verification-badge ${emailVerified ? 'verified' : 'unverified'}`}>
                {emailVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
          </div>

          <div className="profile-field">
            <span className="profile-label">Friends</span>
            <div className="profile-value-row">
              <span className="profile-value">View and manage your friends</span>
              <button
                className="profile-friends-button"
                onClick={onOpenFriends}
              >
                Friends
              </button>
            </div>
          </div>

          <div className="profile-field">
            <span className="profile-label">Member Since</span>
            <span className="profile-value">
              {userDoc?.createdAt && typeof userDoc.createdAt === 'object' && 'toDate' in (userDoc.createdAt as object)
                ? (userDoc.createdAt as { toDate: () => Date }).toDate().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileScreen;
