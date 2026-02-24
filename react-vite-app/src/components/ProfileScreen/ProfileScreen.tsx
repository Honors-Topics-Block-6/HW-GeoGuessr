import { useMemo, useState, useEffect, type ChangeEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllAchievementMeta, isAchievementUnlocked, type AchievementId } from '../../services/achievementService';
import { DAILY_STREAK_UPDATED_EVENT, getDisplayDailyStreak, syncDailyStreakRollover } from '../../services/streakService';
import './ProfileScreen.css';

const QUICK_PROFILE_EMOTES = ['😎', '🔥', '🎯', '🧠', '🚀', '💯'];

export interface ProfileScreenProps {
  onBack: () => void;
  onOpenFriends: () => void;
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

function ProfileScreen({ onBack, onOpenFriends }: ProfileScreenProps): React.ReactElement {
  const {
    user,
    userDoc,
    updateUsername,
    updateFavoriteEmote,
    updateProfileImage,
    totalXp,
    levelInfo,
    levelTitle,
    emailVerified
  } = useAuth();

  const uid: string = user?.uid ?? '';
  const [dailyStreak, setDailyStreak] = useState<number>(() => (uid ? getDisplayDailyStreak(uid) : 0));

  useEffect(() => {
    if (!uid) return;

    // Ensure stale streaks get reset to 0 before display.
    syncDailyStreakRollover(uid);
    setDailyStreak(getDisplayDailyStreak(uid));

    const onStreakUpdated = (event: Event): void => {
      const customEvent = event as CustomEvent<{ uid?: string }>;
      if (customEvent.detail?.uid && customEvent.detail.uid !== uid) return;
      setDailyStreak(getDisplayDailyStreak(uid));
    };

    window.addEventListener(DAILY_STREAK_UPDATED_EVENT, onStreakUpdated);
    return () => window.removeEventListener(DAILY_STREAK_UPDATED_EVENT, onStreakUpdated);
  }, [uid]);

  const [newUsername, setNewUsername] = useState<string>(userDoc?.username || '');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSavingEmote, setIsSavingEmote] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [isEditingEmote, setIsEditingEmote] = useState<boolean>(false);
  const [newFavoriteEmote, setNewFavoriteEmote] = useState<string>(userDoc?.favoriteEmote || '😎');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset input so selecting the same file again still triggers onChange.
    e.target.value = '';
    if (!file) return;

    setError('');
    setSuccess('');

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10MB.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      await updateProfileImage(file);
      setSuccess('Profile picture updated!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError((err as Error).message || 'Failed to upload profile image.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

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

  const handleSaveFavoriteEmote = async (): Promise<void> => {
    setError('');
    setSuccess('');
    setIsSavingEmote(true);
    try {
      await updateFavoriteEmote(newFavoriteEmote);
      setSuccess('Favorite emote updated!');
      setIsEditingEmote(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError((err as Error).message || 'Failed to update favorite emote.');
    } finally {
      setIsSavingEmote(false);
    }
  };

  const handleCancelFavoriteEmote = (): void => {
    setNewFavoriteEmote(userDoc?.favoriteEmote || '😎');
    setIsEditingEmote(false);
    setError('');
  };

  const progressPercent: number = Math.round(levelInfo.progress * 100);
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
    <div className="profile-screen">
      <div className="profile-background">
        <div className="profile-overlay"></div>
      </div>
      <div className="profile-layout">
        <div className="profile-card">
          <button className="profile-back-button" onClick={onBack}>
            ← Back
          </button>

        <div className="profile-avatar">
          {userDoc?.photoURL ? (
            <img
              className="profile-avatar-image"
              src={userDoc.photoURL}
              alt={`${userDoc.username}'s profile`}
            />
          ) : (
            <span className="profile-avatar-icon">👤</span>
          )}
          <label className={`profile-photo-upload ${isUploadingPhoto ? 'disabled' : ''}`}>
            {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={isUploadingPhoto}
            />
          </label>
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
                <div className="profile-username-note">
                  Changing your username is allowed once every 30 days.
                </div>
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
                <div className="profile-username-and-streak">
                  <span className="profile-value">{userDoc?.username}</span>
                  <span className="profile-streak-badge" aria-label={`Daily streak ${dailyStreak}`}>
                    🔥 {dailyStreak}
                  </span>
                </div>
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
            <span className="profile-label">Favorite Emote (Public)</span>
            {isEditingEmote ? (
              <div className="profile-edit-row">
                <input
                  type="text"
                  value={newFavoriteEmote}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewFavoriteEmote(e.target.value)}
                  className="profile-input profile-emote-input"
                  disabled={isSavingEmote}
                  placeholder="Pick an emoji"
                />
                <div className="profile-emote-quick-row">
                  {QUICK_PROFILE_EMOTES.map((emote) => (
                    <button
                      key={emote}
                      className="profile-emote-quick-button"
                      onClick={() => setNewFavoriteEmote(emote)}
                      type="button"
                      disabled={isSavingEmote}
                      aria-label={`Set favorite emote to ${emote}`}
                    >
                      {emote}
                    </button>
                  ))}
                </div>
                <button
                  className="profile-save-button"
                  onClick={handleSaveFavoriteEmote}
                  disabled={isSavingEmote}
                >
                  {isSavingEmote ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="profile-cancel-button"
                  onClick={handleCancelFavoriteEmote}
                  disabled={isSavingEmote}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="profile-value-row">
                <span className="profile-value profile-favorite-emote">{userDoc?.favoriteEmote || '😎'}</span>
                <button
                  className="profile-edit-button"
                  onClick={() => setIsEditingEmote(true)}
                >
                  Edit
                </button>
              </div>
            )}
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

        <section className="profile-achievements-section">
          <div className="profile-achievements-header">
            <span className="profile-label">Achievements</span>
            <span className="profile-achievements-summary">
              {completedAchievements}/{achievementDefinitions.length} unlocked
            </span>
          </div>
          <div className="profile-achievements-panel">
            {achievementDefinitions.map((achievement) => {
              const isUnlocked = achievement.unlocked;
              const progressPercent = Math.round((achievement.progress / achievement.target) * 100);

              return (
                <div
                  key={achievement.id}
                  className={`profile-achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`}
                >
                  <div className="profile-achievement-card-header">
                    <div className={`profile-achievement-circle ${isUnlocked ? 'unlocked' : 'locked'}`}>
                      <span className="profile-achievement-icon">{achievement.icon}</span>
                    </div>
                    <div className="profile-achievement-main">
                      <span className="profile-achievement-title">{achievement.title}</span>
                      <span className="profile-achievement-reward">+{achievement.xpReward.toLocaleString()} XP</span>
                    </div>
                    <span className={`profile-achievement-status ${isUnlocked ? 'unlocked' : 'locked'}`}>
                      {isUnlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>
                  <div className="profile-achievement-progress-row">
                    <div className="profile-achievement-progress-track">
                      <div className="profile-achievement-progress-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="profile-achievement-progress">
                      {achievement.progress.toLocaleString()} / {achievement.target.toLocaleString()}
                    </span>
                  </div>
                  <div className="profile-achievement-hover-card" role="tooltip">
                    <p>
                      <strong>{achievement.highlight}</strong> {achievement.details}
                    </p>
                    <p className="profile-achievement-hover-reward">
                      XP Bonus: +{achievement.xpReward.toLocaleString()} XP
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export default ProfileScreen;
