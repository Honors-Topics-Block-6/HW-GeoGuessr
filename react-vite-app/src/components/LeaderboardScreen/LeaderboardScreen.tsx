import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getLeaderboardByCategory,
  getUserRankByCategory,
  type LeaderboardCategory
} from '../../services/leaderboardService';
import './LeaderboardScreen.css';

interface LeaderboardEntry {
  uid: string;
  username: string;
  favoriteEmote: string;
  level: number;
  levelTitle: string;
  totalXp: number;
  gamesPlayed: number;
  statValue: number;
  rank: number;
}

interface LevelInfo {
  level: number;
  progress: number;
  xpIntoLevel: number;
  currentLevelXp: number;
}

interface UserDoc {
  username?: string;
  favoriteEmote?: string;
  gamesPlayed?: number;
  totalScore?: number;
  totalGuessTimeSeconds?: number;
  fiveKCount?: number;
  twentyFiveKCount?: number;
  photosSubmittedCount?: number;
  [key: string]: unknown;
}

export interface LeaderboardScreenProps {
  onBack: () => void;
}

const LEADERBOARD_CATEGORIES: Array<{
  id: LeaderboardCategory;
  label: string;
  shortLabel: string;
  unit: string;
  emoji: string;
  lowerIsBetter: boolean;
}> = [
  { id: 'level', label: 'Level', shortLabel: 'Level', unit: 'levels', emoji: '🎓', lowerIsBetter: false },
  { id: 'gamesPlayed', label: 'Games Played', shortLabel: 'Games', unit: 'games', emoji: '🎮', lowerIsBetter: false },
  { id: 'averageScore', label: 'Average Score', shortLabel: 'Avg Score', unit: 'pts', emoji: '🏆', lowerIsBetter: false },
  { id: 'fiveKCount', label: 'Number of 5Ks', shortLabel: '5Ks', unit: '5Ks', emoji: '🎯', lowerIsBetter: false },
  { id: 'twentyFiveKCount', label: 'Number of 25Ks', shortLabel: '25Ks', unit: '25Ks', emoji: '👑', lowerIsBetter: false },
  { id: 'averageGuessTime', label: 'Average Guess Time', shortLabel: 'Avg Time', unit: 'sec', emoji: '⏱️', lowerIsBetter: true },
  { id: 'photosSubmittedCount', label: 'Photos Submitted', shortLabel: 'Photos', unit: 'photos', emoji: '📷', lowerIsBetter: false }
];

function getCategoryMeta(category: LeaderboardCategory) {
  return LEADERBOARD_CATEGORIES.find((item) => item.id === category) ?? LEADERBOARD_CATEGORIES[0];
}

function getUserCategoryValue(category: LeaderboardCategory, userDoc: UserDoc | null, currentLevel: number): number {
  switch (category) {
    case 'level':
      return currentLevel;
    case 'gamesPlayed':
      return userDoc?.gamesPlayed ?? 0;
    case 'averageScore': {
      const gamesPlayed = userDoc?.gamesPlayed ?? 0;
      return gamesPlayed > 0 ? (userDoc?.totalScore ?? 0) / gamesPlayed : 0;
    }
    case 'fiveKCount':
      return userDoc?.fiveKCount ?? 0;
    case 'twentyFiveKCount':
      return userDoc?.twentyFiveKCount ?? 0;
    case 'averageGuessTime': {
      const gamesPlayed = userDoc?.gamesPlayed ?? 0;
      return gamesPlayed > 0 ? (userDoc?.totalGuessTimeSeconds ?? 0) / (gamesPlayed * 5) : 0;
    }
    case 'photosSubmittedCount':
      return userDoc?.photosSubmittedCount ?? 0;
    default:
      return 0;
  }
}

function formatCategoryValue(category: LeaderboardCategory, value: number): string {
  if (category === 'level') {
    return Math.round(value).toLocaleString();
  }
  if (category === 'averageGuessTime') {
    return `${value.toFixed(1)}s`;
  }
  if (category === 'averageScore') {
    return value.toFixed(0);
  }
  return Math.round(value).toLocaleString();
}

function LeaderboardScreen({ onBack }: LeaderboardScreenProps): React.ReactElement {
  const { user, userDoc, levelInfo, levelTitle } = useAuth() as {
    user: { uid: string } | null;
    userDoc: UserDoc | null;
    levelInfo: LevelInfo;
    levelTitle: string;
  };

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<LeaderboardCategory>('level');

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard(): Promise<void> {
      setLoading(true);
      setError('');
      try {
        const userValue = getUserCategoryValue(selectedCategory, userDoc, levelInfo.level);
        const [leaderboard, rank] = await Promise.all([
          getLeaderboardByCategory(selectedCategory, 50),
          user ? getUserRankByCategory(user.uid, selectedCategory, userValue) : Promise.resolve(null)
        ]);

        if (!cancelled) {
          setEntries(leaderboard as LeaderboardEntry[]);
          setMyRank(rank as number | null);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
        if (!cancelled) {
          setError('Failed to load leaderboard. Please try again.');
          setLoading(false);
        }
      }
    }

    fetchLeaderboard();
    return () => { cancelled = true; };
  }, [levelInfo.level, selectedCategory, user, userDoc]);

  const isCurrentUser = (uid: string): boolean => user?.uid === uid;
  const userInTop = entries.some((e: LeaderboardEntry) => isCurrentUser(e.uid));

  const topPlayerEntry = entries.length > 0 ? entries[0] : null;
  const selectedMeta = getCategoryMeta(selectedCategory);
  const topPlayerName = topPlayerEntry?.username ?? '---';
  const topPlayerStatText = topPlayerEntry ? formatCategoryValue(selectedCategory, topPlayerEntry.statValue) : '0';
  const myCategoryValue = getUserCategoryValue(selectedCategory, userDoc, levelInfo.level);
  const gapToFirst = topPlayerEntry && user
    ? selectedMeta.lowerIsBetter
      ? Math.max(0, myCategoryValue - topPlayerEntry.statValue)
      : Math.max(0, topPlayerEntry.statValue - myCategoryValue)
    : null;
  const hypeEmoji = myRank ? (myRank <= 10 ? '🔥' : '🚀') : '👀';
  const hypeHeadline = myRank
    ? myRank === 1
      ? `You lead ${selectedMeta.shortLabel}!`
      : myRank <= 10
        ? `#${myRank} in ${selectedMeta.shortLabel} and climbing!`
        : `#${myRank} in ${selectedMeta.shortLabel} today.`
    : 'Log in to see your rank.';
  const hypeSubline = myRank
    ? myRank === 1
      ? 'Defend that title. Everyone is chasing your pace.'
      : myRank <= 10
        ? gapToFirst !== null
          ? selectedMeta.lowerIsBetter
            ? `Only ${formatCategoryValue(selectedCategory, gapToFirst)} less ${selectedMeta.unit} to take the crown.`
            : `Only ${formatCategoryValue(selectedCategory, gapToFirst)} more ${selectedMeta.unit} to catch first place.`
          : 'Keep the streak alive and push for the top spot.'
        : gapToFirst !== null
          ? selectedMeta.lowerIsBetter
            ? `${formatCategoryValue(selectedCategory, gapToFirst)} ${selectedMeta.unit} separates you from #1.`
            : `${formatCategoryValue(selectedCategory, gapToFirst)} more ${selectedMeta.unit} to close the gap to #1.`
          : 'Keep stacking results to climb this board.'
    : 'Play more rounds and push your all-time stats upward.';

  const youRankText = myRank ? `You: #${myRank}` : 'You: Play to rank up';

  const getMedalEmoji = (rank: number): string | null => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <div className="leaderboard-screen">
      <div className="leaderboard-background">
        <div className="leaderboard-overlay"></div>
      </div>

      <div className="leaderboard-card">
        <button className="leaderboard-back-button" onClick={onBack}>
          ← Back
        </button>

        <div className="leaderboard-header">
          <h1 className="leaderboard-title">
            Leaderboard
          </h1>
          <p className="leaderboard-subtitle">
            Claim your place among campus legends.
          </p>

          <div className="leaderboard-hype-card">
            <span className="leaderboard-hype-emoji" role="img" aria-hidden="true">
              {hypeEmoji}
            </span>
            <div className="leaderboard-hype-copy">
              <span className="leaderboard-hype-headline">
                {hypeHeadline}
              </span>
              <span className="leaderboard-hype-subline">
                {hypeSubline}
              </span>
            </div>
          </div>
        </div>

        {loading && (
          <div className="leaderboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading leaderboard...</p>
          </div>
        )}

        {error && (
          <div className="leaderboard-error">
            <span role="img" aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="leaderboard-empty">
            <span role="img" aria-hidden="true">🌱</span>
            <p>No players found yet. Be the first to play!</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            <div className="leaderboard-category-tabs" role="tablist" aria-label="Leaderboard categories">
              {LEADERBOARD_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === category.id}
                  className={`leaderboard-category-tab${selectedCategory === category.id ? ' leaderboard-category-tab-active' : ''}`}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  <span role="img" aria-hidden="true">{category.emoji}</span>
                  {category.shortLabel}
                </button>
              ))}
            </div>

            <div className="leaderboard-highlight-strip">
              <span className="leaderboard-highlight-pill">
                <span role="img" aria-hidden="true">👑</span>
                Top: {topPlayerName} &middot; {topPlayerStatText} {selectedMeta.unit}
              </span>
              <span className="leaderboard-highlight-pill">
                <span role="img" aria-hidden="true">📈</span>
                {youRankText}
              </span>
            </div>

            <div className="leaderboard-list">
              <div className="leaderboard-list-header">
                <span className="leaderboard-col-rank">Rank</span>
                <span className="leaderboard-col-player">Player</span>
                <span className="leaderboard-col-level">Level</span>
                <span className="leaderboard-col-xp">{selectedMeta.shortLabel}</span>
                <span className="leaderboard-col-games">Games</span>
              </div>

              {entries.map((entry: LeaderboardEntry) => {
                const medal = getMedalEmoji(entry.rank);
                const isMeClass = isCurrentUser(entry.uid) ? ' leaderboard-row-me' : '';
                const topClass = entry.rank <= 3 ? ` leaderboard-row-top${entry.rank}` : '';

                return (
                  <div
                    key={entry.uid}
                    className={`leaderboard-row${isMeClass}${topClass}`}
                  >
                    <span className="leaderboard-col-rank">
                      {medal ? (
                        <span className="leaderboard-medal">{medal}</span>
                      ) : (
                        <span className="leaderboard-rank-num">#{entry.rank}</span>
                      )}
                    </span>

                    <span className="leaderboard-col-player">
                      <span className="leaderboard-username">{entry.username} <span className="leaderboard-favorite-emote" role="img" aria-label="favorite emote">{entry.favoriteEmote || '😎'}</span></span>
                      <span className="leaderboard-level-title">{entry.levelTitle}</span>
                    </span>

                    <span className="leaderboard-col-level">
                      <span className="leaderboard-level-badge">Lvl {entry.level}</span>
                    </span>

                    <span className="leaderboard-col-xp">
                      {formatCategoryValue(selectedCategory, entry.statValue)} <span className="leaderboard-xp-emoji" role="img" aria-hidden="true">{selectedMeta.emoji}</span>
                    </span>

                    <span className="leaderboard-col-games">
                      {entry.gamesPlayed} <span className="leaderboard-games-emoji" role="img" aria-hidden="true">🎯</span>
                    </span>
                  </div>
                );
              })}

              {/* Show current user's position if they're not in the top list */}
              {!userInTop && myRank && (
                <>
                  <div className="leaderboard-separator">
                    <span>...</span>
                  </div>
                  <div className="leaderboard-row leaderboard-row-me">
                    <span className="leaderboard-col-rank">
                      <span className="leaderboard-rank-num">#{myRank}</span>
                    </span>
                    <span className="leaderboard-col-player">
                      <span className="leaderboard-username">{userDoc?.username ?? 'You'} <span className="leaderboard-favorite-emote" role="img" aria-label="favorite emote">{userDoc?.favoriteEmote || '😎'}</span></span>
                      <span className="leaderboard-level-title">{levelTitle}</span>
                    </span>
                    <span className="leaderboard-col-level">
                      <span className="leaderboard-level-badge">Lvl {levelInfo.level}</span>
                    </span>
                    <span className="leaderboard-col-xp">
                      {formatCategoryValue(selectedCategory, myCategoryValue)} <span className="leaderboard-xp-emoji" role="img" aria-hidden="true">{selectedMeta.emoji}</span>
                    </span>
                    <span className="leaderboard-col-games">
                      {(userDoc?.gamesPlayed ?? 0)} <span className="leaderboard-games-emoji" role="img" aria-hidden="true">🎯</span>
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LeaderboardScreen;
