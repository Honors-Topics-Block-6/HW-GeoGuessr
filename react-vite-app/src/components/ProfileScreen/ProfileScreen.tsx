import { useState, type ChangeEvent } from 'react';
import { useAuth, type BuildingStat, type DailyStatBucket } from '../../contexts/AuthContext';
import { useFriends } from '../../hooks/useFriends';
import { getFavoriteAndWorstBuildings } from '../../utils/buildingStats';
import './ProfileScreen.css';

export interface ProfileScreenProps {
  onBack: () => void;
  onOpenFriends: () => void;
}

function ProfileScreen({ onBack, onOpenFriends }: ProfileScreenProps): React.ReactElement {
  const { user, userDoc, updateUsername, totalXp, levelInfo, levelTitle, emailVerified } = useAuth();

  const [newUsername, setNewUsername] = useState<string>(userDoc?.username || '');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'profile' | 'stats'>('profile');
  const [statsInterval, setStatsInterval] = useState<'day' | 'week' | 'month' | 'all'>('all');
  const [statsDifficulty, setStatsDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');

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
  const gamesPlayedAllTime: number = userDoc?.gamesPlayed ?? 0;
  const totalScoreAllTime: number = userDoc?.totalScore ?? 0;
  const totalGuessTimeSecondsAllTime: number = userDoc?.totalGuessTimeSeconds ?? 0;
  const fiveKCountAllTime: number = userDoc?.fiveKCount ?? 0;
  const twentyFiveKCountAllTime: number = userDoc?.twentyFiveKCount ?? 0;
  const photosSubmittedCountAllTime: number = userDoc?.photosSubmittedCount ?? 0;
  const followersCount: number = userDoc?.followersCount ?? 0;
  const buildingStats: Record<string, BuildingStat> = userDoc?.buildingStats ?? {};
  const dailyStats: Record<string, DailyStatBucket> = userDoc?.dailyStats ?? {};
  const dailyStatsByDifficulty: Record<string, Record<string, DailyStatBucket>> = userDoc?.dailyStatsByDifficulty ?? {};

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
    return monthStart
      ? monthStart.date.toLocaleString('en-US', { month: 'short' })
      : '';
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
      if (statsDifficulty === 'all') {
        return allTimeTotals;
      }
      const difficultyTotals = sumBuckets(
        Object.fromEntries(
          Object.entries(dailyStatsByDifficulty).map(([dateKey, diffMap]) => [
            dateKey,
            diffMap[statsDifficulty]
          ])
        ) as Record<string, DailyStatBucket>,
        null
      );
      return {
        ...allTimeTotals,
        ...difficultyTotals,
        photosSubmittedCount: allTimeTotals.photosSubmittedCount
      };
    }

    const days = statsInterval === 'day' ? 1 : statsInterval === 'week' ? 7 : 30;
    const keys = getDateKeys(days);
    const timeTotals = sumBuckets(dailyStats, keys);
    if (statsDifficulty === 'all') {
      return timeTotals;
    }
    const difficultyTotals = sumBuckets(
      Object.fromEntries(
        keys.map((dateKey) => [dateKey, dailyStatsByDifficulty[dateKey]?.[statsDifficulty]])
      ) as Record<string, DailyStatBucket>,
      keys
    );
    return {
      ...timeTotals,
      ...difficultyTotals,
      photosSubmittedCount: timeTotals.photosSubmittedCount
    };
  };

  const filteredStats = getFilteredStats();
  const averageScore = filteredStats.gamesPlayed > 0 ? Math.round(filteredStats.totalScore / filteredStats.gamesPlayed) : 0;
  const averageGuessTime = filteredStats.gamesPlayed > 0 ? filteredStats.totalGuessTimeSeconds / (filteredStats.gamesPlayed * 5) : 0;
  const friendsToFollowerRatio = followersCount > 0 ? (friends.length / followersCount) : null;

  const { favoriteBuilding, worstBuilding } = getFavoriteAndWorstBuildings(filteredStats.buildingStats);

  return (
    <div className="profile-screen">
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

        <div className="profile-tabs">
          <button
            className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            type="button"
          >
            Profile
          </button>
          <button
            className={`profile-tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
            type="button"
          >
            Statistics
          </button>
        </div>

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
              <span className="profile-xp-stat-value">{gamesPlayedAllTime}</span>
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
                <span className="profile-activity-total">
                  {totalGamesYear.toLocaleString()} games in the last year
                </span>
              </div>
              <div className="profile-activity-months">
                {monthLabels.map((label, index) => (
                  <span key={`${label}-${index}`} className="profile-activity-month">
                    {label}
                  </span>
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
                          return (
                            <div
                              key={`empty-${weekIndex}-${dayIndex}`}
                              className="profile-activity-cell level-0 is-empty"
                              aria-hidden="true"
                            />
                          );
                        }
                        const tooltip = `${day.gamesPlayed} ${day.gamesPlayed === 1 ? 'game' : 'games'} on ${day.date.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}`;
                        return (
                          <div
                            key={day.key}
                            className={`profile-activity-cell ${getHeatmapLevel(day.gamesPlayed)}`}
                            title={tooltip}
                            aria-label={tooltip}
                          />
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
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsInterval === 'day' ? 'active' : ''}`}
                  onClick={() => setStatsInterval('day')}
                >
                  Day
                </button>
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsInterval === 'week' ? 'active' : ''}`}
                  onClick={() => setStatsInterval('week')}
                >
                  Week
                </button>
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsInterval === 'month' ? 'active' : ''}`}
                  onClick={() => setStatsInterval('month')}
                >
                  Month
                </button>
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsInterval === 'all' ? 'active' : ''}`}
                  onClick={() => setStatsInterval('all')}
                >
                  All Time
                </button>
              </div>
            </div>
            <div className="profile-stats-interval">
              <span className="profile-stats-interval-label">Difficulty</span>
              <div className="profile-stats-interval-buttons">
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsDifficulty === 'all' ? 'active' : ''}`}
                  onClick={() => setStatsDifficulty('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsDifficulty === 'easy' ? 'active' : ''}`}
                  onClick={() => setStatsDifficulty('easy')}
                >
                  Easy
                </button>
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsDifficulty === 'medium' ? 'active' : ''}`}
                  onClick={() => setStatsDifficulty('medium')}
                >
                  Medium
                </button>
                <button
                  type="button"
                  className={`profile-stats-interval-button ${statsDifficulty === 'hard' ? 'active' : ''}`}
                  onClick={() => setStatsDifficulty('hard')}
                >
                  Hard
                </button>
              </div>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Games Played</span>
              <span className="profile-stat-value">{filteredStats.gamesPlayed.toLocaleString()}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Average Score</span>
              <span className="profile-stat-value">
                {filteredStats.gamesPlayed > 0 ? averageScore.toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Number of 5ks</span>
              <span className="profile-stat-value">{filteredStats.fiveKCount.toLocaleString()}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Number of 25ks</span>
              <span className="profile-stat-value">{filteredStats.twentyFiveKCount.toLocaleString()}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Favorite Building</span>
              <span className="profile-stat-value">{favoriteBuilding}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Worst Building</span>
              <span className="profile-stat-value">{worstBuilding}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Average Guess Time</span>
              <span className="profile-stat-value">
                {filteredStats.gamesPlayed > 0 ? `${averageGuessTime.toFixed(1)}s` : 'N/A'}
              </span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Number of Photos Submitted</span>
              <span className="profile-stat-value">{filteredStats.photosSubmittedCount.toLocaleString()}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Time Joined</span>
              <span className="profile-stat-value">{formatTimestamp(userDoc?.createdAt)}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Last Online</span>
              <span className="profile-stat-value">{formatTimestamp(userDoc?.lastOnline)}</span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Friends to Follower Ratio</span>
              <span className="profile-stat-value">
                {friendsToFollowerRatio !== null ? friendsToFollowerRatio.toFixed(2) : 'N/A'}
              </span>
            </div>
            <div className="profile-stat-row">
              <span className="profile-stat-label">Favorite Emote</span>
              <span className="profile-stat-value">Coming soon</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileScreen;
