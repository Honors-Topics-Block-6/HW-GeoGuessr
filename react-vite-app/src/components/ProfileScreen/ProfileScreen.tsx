import { useMemo, useState, useEffect, type ChangeEvent } from 'react';
import { useAuth, type BuildingStat, type DailyStatBucket } from '../../contexts/AuthContext';
import { useFriends } from '../../hooks/useFriends';
import { getFavoriteAndWorstBuildings } from '../../utils/buildingStats';
import { getAllAchievementMeta, isAchievementUnlocked, type AchievementId } from '../../services/achievementService';
import { DAILY_STREAK_UPDATED_EVENT, getDisplayDailyStreak, syncDailyStreakRollover } from '../../services/streakService';
import { isHeicFile, normalizeImageFile } from '../../utils/compressImage';
import ImageCropModal from '../ImageCropModal/ImageCropModal';
import './ProfileScreen.css';

const QUICK_PROFILE_EMOTES = ['😎', '🔥', '🎯', '🧠', '🚀', '💯'];

export interface ProfileScreenProps {
  onBack: () => void;
  onOpenFriends: () => void;
  onOpenAchievements?: () => void;
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

function ProfileScreen({ onBack, onOpenFriends, onOpenAchievements }: ProfileScreenProps): React.ReactElement {
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
  const [pendingPhotoSrc, setPendingPhotoSrc] = useState<string | null>(null);
  const [pendingPhotoFilename, setPendingPhotoFilename] = useState<string>('profile.jpg');
  const [activeTab, setActiveTab] = useState<'profile' | 'stats'>('profile');
  const [statsInterval, setStatsInterval] = useState<'day' | 'week' | 'month' | 'all'>('all');
  const [statsDifficulty, setStatsDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    let file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    if (!file.type.startsWith('image/') && !isHeicFile(file)) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10MB.');
      return;
    }

    try {
      file = await normalizeImageFile(file);
    } catch {
      setError('Could not process this image. Please convert it to JPG or PNG first.');
      return;
    }

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });

      setPendingPhotoFilename(file.name || 'profile.jpg');
      setPendingPhotoSrc(dataUrl);
    } catch (err) {
      setError((err as Error).message || 'Failed to load image.');
    }
  };

  const handleCancelCrop = (): void => {
    setPendingPhotoSrc(null);
    setPendingPhotoFilename('profile.jpg');
  };

  const handleConfirmCrop = async (croppedFile: File): Promise<void> => {
    setError('');
    setSuccess('');
    setIsUploadingPhoto(true);
    try {
      await updateProfileImage(croppedFile);
      setSuccess('Profile picture updated!');
      setPendingPhotoSrc(null);
      setPendingPhotoFilename('profile.jpg');
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
    if (!trimmed) { setError('Username cannot be empty.'); return; }
    if (trimmed.length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (trimmed === userDoc?.username) { setIsEditing(false); return; }
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

  const progressPercent = Math.round(levelInfo.progress * 100);
  const gamesPlayedAllTime = userDoc?.gamesPlayed ?? 0;
  const totalScoreAllTime = userDoc?.totalScore ?? 0;
  const totalGuessTimeSecondsAllTime = userDoc?.totalGuessTimeSeconds ?? 0;
  const fiveKCountAllTime = userDoc?.fiveKCount ?? 0;
  const twentyFiveKCountAllTime = userDoc?.twentyFiveKCount ?? 0;
  const photosSubmittedCountAllTime = userDoc?.photosSubmittedCount ?? 0;
  const followersCount = userDoc?.followersCount ?? 0;
  const buildingStats: Record<string, BuildingStat> = userDoc?.buildingStats ?? {};
  const dailyStats: Record<string, DailyStatBucket> = userDoc?.dailyStats ?? {};
  const dailyStatsByDifficulty: Record<string, Record<string, DailyStatBucket>> = userDoc?.dailyStatsByDifficulty ?? {};
  const gamesPlayed = userDoc?.gamesPlayed ?? 0;
  const { friends } = useFriends(user?.uid ?? null, userDoc?.username ?? '');

  const formatTimestamp = (value: unknown): string => {
    if (value && typeof value === 'object' && 'toDate' in (value as object)) {
      return (value as { toDate: () => Date }).toDate().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
    return 'N/A';
  };

  const getLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDateKeys = (days: number): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < days; i += 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      keys.push(getLocalDateKey(date));
    }
    return keys;
  };

  const getHeatmapWeeks = (daysBack: number) => {
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (daysBack - 1));
    const startOfWeek = new Date(startDate);
    startOfWeek.setDate(startDate.getDate() - startDate.getDay());
    const endOfWeek = new Date(endDate);
    endOfWeek.setDate(endDate.getDate() + (6 - endDate.getDay()));
    const weeks: Array<Array<{ date: Date; key: string; gamesPlayed: number } | null>> = [];
    const current = new Date(startOfWeek);
    while (current <= endOfWeek) {
      const week: Array<{ date: Date; key: string; gamesPlayed: number } | null> = [];
      for (let i = 0; i < 7; i += 1) {
        const dayDate = new Date(current);
        if (dayDate < startDate || dayDate > endDate) {
          week.push(null);
        } else {
          const key = getLocalDateKey(dayDate);
          const games = dailyStats[key]?.gamesPlayed ?? 0;
          week.push({ date: dayDate, key, gamesPlayed: games });
        }
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }
    return { weeks, startDate, endDate };
  };

  const { weeks: heatmapWeeks } = getHeatmapWeeks(365);
  const heatmapDays = heatmapWeeks.flat().filter((day): day is { date: Date; key: string; gamesPlayed: number } => !!day);
  const totalGamesYear = heatmapDays.reduce((sum, day) => sum + day.gamesPlayed, 0);
  const maxHeatmapValue = heatmapDays.reduce((max, day) => Math.max(max, day.gamesPlayed), 0);
  const getHeatmapLevel = (value: number): string => {
    if (value <= 0) return 'level-0';
    if (maxHeatmapValue <= 1) return 'level-1';
    const ratio = value / maxHeatmapValue;
    if (ratio <= 0.25) return 'level-1';
    if (ratio <= 0.5) return 'level-2';
    if (ratio <= 0.75) return 'level-3';
    return 'level-4';
  };

  const monthLabels = heatmapWeeks.map((week) => {
    const monthStart = week?.find((day) => day && day.date.getDate() === 1);
    return monthStart ? monthStart.date.toLocaleString('en-US', { month: 'short' }) : '';
  });

  const sumBuckets = (bucketsByDate: Record<string, DailyStatBucket>, keys: string[] | null) => {
    const totals = {
      gamesPlayed: 0,
      totalScore: 0,
      totalGuessTimeSeconds: 0,
      fiveKCount: 0,
      twentyFiveKCount: 0,
      photosSubmittedCount: 0,
      buildingStats: {} as Record<string, BuildingStat>
    };
    const dates = keys ?? Object.keys(bucketsByDate);
    for (const key of dates) {
      const dayStats = bucketsByDate[key];
      if (!dayStats) continue;
      totals.gamesPlayed += dayStats.gamesPlayed ?? 0;
      totals.totalScore += dayStats.totalScore ?? 0;
      totals.totalGuessTimeSeconds += dayStats.totalGuessTimeSeconds ?? 0;
      totals.fiveKCount += dayStats.fiveKCount ?? 0;
      totals.twentyFiveKCount += dayStats.twentyFiveKCount ?? 0;
      totals.photosSubmittedCount += dayStats.photosSubmittedCount ?? 0;
      const dayBuildings = dayStats.buildingStats ?? {};
      for (const [entryKey, entry] of Object.entries(dayBuildings)) {
        const current = totals.buildingStats[entryKey];
        if (!current) {
          totals.buildingStats[entryKey] = { ...entry };
        } else {
          totals.buildingStats[entryKey] = {
            building: current.building,
            floor: current.floor,
            totalScore: current.totalScore + entry.totalScore,
            count: current.count + entry.count
          };
        }
      }
    }
    return totals;
  };

  const getFilteredStats = () => {
    if (statsInterval === 'all') {
      const allTimeTotals = {
        gamesPlayed: gamesPlayedAllTime,
        totalScore: totalScoreAllTime,
        totalGuessTimeSeconds: totalGuessTimeSecondsAllTime,
        fiveKCount: fiveKCountAllTime,
        twentyFiveKCount: twentyFiveKCountAllTime,
        photosSubmittedCount: photosSubmittedCountAllTime,
        buildingStats
      };
      if (statsDifficulty === 'all') return allTimeTotals;
      const difficultyTotals = sumBuckets(
        Object.fromEntries(
          Object.entries(dailyStatsByDifficulty).map(([dateKey, diffMap]) => [dateKey, diffMap[statsDifficulty]])
        ) as Record<string, DailyStatBucket>,
        null
      );
      return { ...allTimeTotals, ...difficultyTotals, photosSubmittedCount: allTimeTotals.photosSubmittedCount };
    }
    const days = statsInterval === 'day' ? 1 : statsInterval === 'week' ? 7 : 30;
    const keys = getDateKeys(days);
    const timeTotals = sumBuckets(dailyStats, keys);
    if (statsDifficulty === 'all') return timeTotals;
    const difficultyTotals = sumBuckets(
      Object.fromEntries(
        keys.map((dateKey) => [dateKey, dailyStatsByDifficulty[dateKey]?.[statsDifficulty]])
      ) as Record<string, DailyStatBucket>,
      keys
    );
    return { ...timeTotals, ...difficultyTotals, photosSubmittedCount: timeTotals.photosSubmittedCount };
  };

  const filteredStats = getFilteredStats();
  const averageScore = filteredStats.gamesPlayed > 0 ? Math.round(filteredStats.totalScore / filteredStats.gamesPlayed) : 0;
  const averageGuessTime = filteredStats.gamesPlayed > 0 ? filteredStats.totalGuessTimeSeconds / (filteredStats.gamesPlayed * 5) : 0;
  const friendsToFollowerRatio = followersCount > 0 ? (friends.length / followersCount) : null;
  const { favoriteBuilding, worstBuilding } = getFavoriteAndWorstBuildings(filteredStats.buildingStats);

  const achievementDefinitions: AchievementDefinition[] = useMemo(() => {
    const allMeta = getAllAchievementMeta();
    return allMeta.map((meta) => {
      let target = 1;
      let progress = 0;
      if (meta.id === 'first-game') { target = 1; progress = gamesPlayed; }
      else if (meta.id === 'weekend-warrior') { target = 25; progress = gamesPlayed; }
      else if (meta.id === 'xp-collector') { target = 5000; progress = totalXp; }
      else if (meta.id === 'rising-star') { target = 10; progress = levelInfo.level; }
      else if (meta.id === 'verified-account') { target = 1; progress = emailVerified ? 1 : 0; }
      else if (['easy-finish', 'medium-finish', 'hard-finish', 'bullseye'].includes(meta.id)) {
        target = 1;
        progress = isAchievementUnlocked(meta.id) ? 1 : 0;
      }
      const clampedProgress = Math.min(progress, target);
      return { ...meta, target, progress: clampedProgress, unlocked: clampedProgress >= target };
    });
  }, [emailVerified, gamesPlayed, levelInfo.level, totalXp]);
  const completedAchievements = achievementDefinitions.filter((a) => a.progress >= a.target).length;

  return (
    <div className="profile-screen">
      {pendingPhotoSrc && (
        <ImageCropModal
          imageSrc={pendingPhotoSrc}
          filename={pendingPhotoFilename}
          onCancel={handleCancelCrop}
          onConfirm={handleConfirmCrop}
        />
      )}
      <div className="profile-background">
        <div className="profile-overlay"></div>
      </div>
      <div className="profile-layout">
        <div className="profile-card">
          <button className="profile-back-button" onClick={onBack}>← Back</button>
          <div className="profile-avatar">
            {userDoc?.photoURL ? (
              <img className="profile-avatar-image" src={userDoc.photoURL} alt={`${userDoc.username}'s profile`} />
            ) : (
              <span className="profile-avatar-icon">👤</span>
            )}
            <label className={`profile-photo-upload ${isUploadingPhoto ? 'disabled' : ''}`}>
              {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
              <input type="file" accept="image/*,.heic,.heif" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
            </label>
          </div>
          <h1 className="profile-title">Your Profile</h1>
          {error && <div className="profile-error">{error}</div>}
          {success && <div className="profile-success">{success}</div>}
          <div className="profile-tabs">
            <button className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')} type="button">Profile</button>
            <button className={`profile-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')} type="button">Statistics</button>
          </div>
          {/* ── Level & XP Section ── */}
          <div className="profile-level-section">
            <div className="profile-level-header">
              <span className="profile-level-badge">Lvl {levelInfo.level}</span>
              <span className="profile-level-title">{levelTitle}</span>
            </div>
            <div className="profile-xp-bar-container">
              <div className="profile-xp-bar">
                <div className="profile-xp-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="profile-xp-bar-labels">
                <span className="profile-xp-current">{levelInfo.xpIntoLevel.toLocaleString()} XP</span>
                <span className="profile-xp-needed">{levelInfo.currentLevelXp.toLocaleString()} XP</span>
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
          {activeTab === 'profile' ? (
            <div className="profile-fields">
              <div className="profile-field">
                <span className="profile-label">Username</span>
                {isEditing ? (
                  <div className="profile-edit-row">
                    <input type="text" value={newUsername} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value)} className="profile-input" autoFocus disabled={isSaving} />
                    <button className="profile-save-button" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
                    <button className="profile-cancel-button" onClick={handleCancel} disabled={isSaving}>Cancel</button>
                  </div>
                ) : (
                  <div className="profile-value-row">
                    <span className="profile-value">{userDoc?.username}</span>
                    <button className="profile-edit-button" onClick={() => setIsEditing(true)}>Edit</button>
                  </div>
                )}
              </div>
              <div className="profile-field">
                <span className="profile-label">Email</span>
                <div className="profile-value-row">
                  <span className="profile-value">{user?.email}</span>
                  <span className={`profile-verification-badge ${emailVerified ? 'verified' : 'unverified'}`}>{emailVerified ? 'Verified' : 'Unverified'}</span>
                </div>
              </div>
              <div className="profile-field">
                <span className="profile-label">Friends</span>
                <div className="profile-value-row">
                  <span className="profile-value">View and manage your friends</span>
                  <button className="profile-friends-button" onClick={onOpenFriends}>Friends</button>
                </div>
              </div>
              {onOpenAchievements && (
                <div className="profile-field">
                  <span className="profile-label">Achievements</span>
                  <div className="profile-value-row">
                    <span className="profile-value">Track your milestones and XP rewards</span>
                    <button className="profile-friends-button" onClick={onOpenAchievements}>View Achievements</button>
                  </div>
                </div>
              )}
              <div className="profile-field">
                <span className="profile-label">Member Since</span>
                <span className="profile-value">{formatTimestamp(userDoc?.createdAt)}</span>
              </div>
            </div>
          ) : (
            <div className="profile-stats">
              <div className="profile-activity">
                <div className="profile-activity-header">
                  <div className="profile-activity-header-text">
                    <span className="profile-activity-title">Games Played Activity</span>
                    <span className="profile-activity-subtitle">Last 365 days</span>
                  </div>
                  <span className="profile-activity-total">{totalGamesYear.toLocaleString()} games in the last year</span>
                </div>
                <div className="profile-activity-months">
                  {monthLabels.map((label, index) => (
                    <span key={`${label}-${index}`} className="profile-activity-month">{label}</span>
                  ))}
                </div>
                <div className="profile-activity-body">
                  <div className="profile-activity-weekdays">
                    <span className="profile-activity-weekday" style={{ gridRow: 2 }}>Mon</span>
                    <span className="profile-activity-weekday" style={{ gridRow: 4 }}>Wed</span>
                    <span className="profile-activity-weekday" style={{ gridRow: 6 }}>Fri</span>
                  </div>
                  <div className="profile-activity-grid">
                    {heatmapWeeks.map((week, weekIndex) => (
                      <div key={`week-${weekIndex}`} className="profile-activity-week">
                        {week.map((day, dayIndex) => {
                          if (!day) {
                            return <div key={`empty-${weekIndex}-${dayIndex}`} className="profile-activity-cell level-0 is-empty" aria-hidden="true" />;
                          }
                          const tooltip = `${day.gamesPlayed} ${day.gamesPlayed === 1 ? 'game' : 'games'} on ${day.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
                          return (
                            <div key={day.key} className={`profile-activity-cell ${getHeatmapLevel(day.gamesPlayed)}`} title={tooltip} aria-label={tooltip} />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="profile-activity-legend">
                  <span className="profile-activity-legend-label">Less</span>
                  <div className="profile-activity-legend-cells">
                    <span className="profile-activity-cell level-0" />
                    <span className="profile-activity-cell level-1" />
                    <span className="profile-activity-cell level-2" />
                    <span className="profile-activity-cell level-3" />
                    <span className="profile-activity-cell level-4" />
                  </div>
                  <span className="profile-activity-legend-label">More</span>
                </div>
              </div>
              <div className="profile-stats-interval">
                <span className="profile-stats-interval-label">Sorting</span>
                <div className="profile-stats-interval-buttons">
                  {(['day', 'week', 'month', 'all'] as const).map((interval) => (
                    <button key={interval} type="button" className={`profile-stats-interval-button ${statsInterval === interval ? 'active' : ''}`} onClick={() => setStatsInterval(interval)}>
                      {interval === 'all' ? 'All Time' : interval.charAt(0).toUpperCase() + interval.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-stats-interval">
                <span className="profile-stats-interval-label">Difficulty</span>
                <div className="profile-stats-interval-buttons">
                  {(['all', 'easy', 'medium', 'hard'] as const).map((diff) => (
                    <button key={diff} type="button" className={`profile-stats-interval-button ${statsDifficulty === diff ? 'active' : ''}`} onClick={() => setStatsDifficulty(diff)}>
                      {diff === 'all' ? 'All' : diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-stat-row"><span className="profile-stat-label">Games Played</span><span className="profile-stat-value">{filteredStats.gamesPlayed.toLocaleString()}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Average Score</span><span className="profile-stat-value">{filteredStats.gamesPlayed > 0 ? averageScore.toLocaleString() : 'N/A'}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Number of 5ks</span><span className="profile-stat-value">{filteredStats.fiveKCount.toLocaleString()}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Number of 25ks</span><span className="profile-stat-value">{filteredStats.twentyFiveKCount.toLocaleString()}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Favorite Building</span><span className="profile-stat-value">{favoriteBuilding}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Worst Building</span><span className="profile-stat-value">{worstBuilding}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Average Guess Time</span><span className="profile-stat-value">{filteredStats.gamesPlayed > 0 ? `${averageGuessTime.toFixed(2)}s` : 'N/A'}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Number of Photos Submitted</span><span className="profile-stat-value">{filteredStats.photosSubmittedCount.toLocaleString()}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Time Joined</span><span className="profile-stat-value">{formatTimestamp(userDoc?.createdAt)}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Last Online</span><span className="profile-stat-value">{formatTimestamp(userDoc?.lastOnline)}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Friends to Follower Ratio</span><span className="profile-stat-value">{friendsToFollowerRatio !== null ? friendsToFollowerRatio.toFixed(2) : 'N/A'}</span></div>
              <div className="profile-stat-row"><span className="profile-stat-label">Favorite Emote</span><span className="profile-stat-value">{userDoc?.favoriteEmote || '😎'}</span></div>
              <div className="profile-field">
                <span className="profile-label">Favorite Emote (Public)</span>
                {isEditingEmote ? (
                  <div className="profile-edit-row">
                    <input type="text" value={newFavoriteEmote} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewFavoriteEmote(e.target.value)} className="profile-input profile-emote-input" disabled={isSavingEmote} placeholder="Pick an emoji" />
                    <div className="profile-emote-quick-row">
                      {QUICK_PROFILE_EMOTES.map((emote) => (
                        <button key={emote} className="profile-emote-quick-button" onClick={() => setNewFavoriteEmote(emote)} type="button" disabled={isSavingEmote} aria-label={`Set favorite emote to ${emote}`}>{emote}</button>
                      ))}
                    </div>
                    <button className="profile-save-button" onClick={handleSaveFavoriteEmote} disabled={isSavingEmote}>{isSavingEmote ? 'Saving...' : 'Save'}</button>
                    <button className="profile-cancel-button" onClick={handleCancelFavoriteEmote} disabled={isSavingEmote}>Cancel</button>
                  </div>
                ) : (
                  <div className="profile-value-row">
                    <span className="profile-value profile-favorite-emote">{userDoc?.favoriteEmote || '😎'}</span>
                    <button className="profile-edit-button" onClick={() => setIsEditingEmote(true)}>Edit</button>
                  </div>
                )}
              </div>
            </div>
          )}
          <section className="profile-achievements-section">
            <div className="profile-achievements-header">
              <span className="profile-label">Achievements</span>
              <span className="profile-achievements-summary">{completedAchievements}/{achievementDefinitions.length} unlocked</span>
            </div>
            <div className="profile-achievements-panel">
              {achievementDefinitions.map((achievement) => {
                const isUnlocked = achievement.unlocked;
                const progressPct = Math.round((achievement.progress / achievement.target) * 100);
                return (
                  <div key={achievement.id} className={`profile-achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`}>
                    <div className="profile-achievement-card-header">
                      <div className={`profile-achievement-circle ${isUnlocked ? 'unlocked' : 'locked'}`}>
                        <span className="profile-achievement-icon">{achievement.icon}</span>
                      </div>
                      <div className="profile-achievement-main">
                        <span className="profile-achievement-title">{achievement.title}</span>
                        <span className="profile-achievement-reward">+{achievement.xpReward.toLocaleString()} XP</span>
                      </div>
                      <span className={`profile-achievement-status ${isUnlocked ? 'unlocked' : 'locked'}`}>{isUnlocked ? 'Unlocked' : 'Locked'}</span>
                    </div>
                    <div className="profile-achievement-progress-row">
                      <div className="profile-achievement-progress-track">
                        <div className="profile-achievement-progress-fill" style={{ width: `${progressPct}%` }} />
                      </div>
                      <span className="profile-achievement-progress">{achievement.progress.toLocaleString()} / {achievement.target.toLocaleString()}</span>
                    </div>
                    <div className="profile-achievement-hover-card" role="tooltip">
                      <p><strong>{achievement.highlight}</strong> {achievement.details}</p>
                      <p className="profile-achievement-hover-reward">XP Bonus: +{achievement.xpReward.toLocaleString()} XP</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default ProfileScreen;
