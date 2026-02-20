import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getLeaderboard, getUserRank } from '../../services/leaderboardService';
import './LeaderboardScreen.css';

interface LeaderboardEntry {
  uid: string;
  username: string;
  level: number;
  levelTitle: string;
  totalXp: number;
  gamesPlayed: number;
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
  gamesPlayed?: number;
  [key: string]: unknown;
}

export interface LeaderboardScreenProps {
  onBack: () => void;
}

function LeaderboardScreen({ onBack }: LeaderboardScreenProps): React.ReactElement {
  const { user, userDoc, totalXp, levelInfo, levelTitle } = useAuth() as {
    user: { uid: string } | null;
    userDoc: UserDoc | null;
    totalXp: number;
    levelInfo: LevelInfo;
    levelTitle: string;
  };

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard(): Promise<void> {
      try {
        const [leaderboard, rank] = await Promise.all([
          getLeaderboard(50),
          user ? getUserRank(user.uid, totalXp) : Promise.resolve(null)
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
  }, [user, totalXp]);

  const isCurrentUser = (uid: string): boolean => user?.uid === uid;
  const userInTop = entries.some((e: LeaderboardEntry) => isCurrentUser(e.uid));

  const topPlayerEntry = entries.length > 0 ? entries[0] : null;
  const mostGamesEntry = entries.length > 0
    ? entries.reduce(
        (max: LeaderboardEntry, entry: LeaderboardEntry) =>
          entry.gamesPlayed > max.gamesPlayed ? entry : max,
        entries[0] as LeaderboardEntry
      )
    : null;

  const topPlayerName = topPlayerEntry?.username ?? '---';
  const topPlayerXpText = topPlayerEntry ? topPlayerEntry.totalXp.toLocaleString() : '0';
  const mostGamesName = mostGamesEntry?.username ?? '---';
  const mostGamesPlayedText = mostGamesEntry ? mostGamesEntry.gamesPlayed.toLocaleString() : '0';
  const hypeEmoji = myRank ? (myRank <= 10 ? '🔥' : '🚀') : '👀';
  const hypeHeadline = myRank
    ? myRank === 1
      ? 'You own the crown!'
      : myRank <= 10
        ? `#${myRank} and climbing!`
        : `#${myRank} today — top 10 is within reach!`
    : 'Log in to see your rank.';
  const hypeSubline = myRank
    ? myRank === 1
      ? 'Defend that title like a champ. Everyone’s chasing you.'
      : myRank <= 10
        ? 'Keep the streak alive and push for that gold podium.'
        : 'Stack more XP, complete daily goals, and rocket up the board.'
    : 'Play rounds, earn XP, and watch your name soar.';

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
          <span className="leaderboard-icon" role="img" aria-hidden="true">🏆</span>
          <h1 className="leaderboard-title">
            Leaderboard <span className="leaderboard-title-emoji">🌟</span>
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
            <div className="leaderboard-highlight-strip">
              <span className="leaderboard-highlight-pill">
                <span role="img" aria-hidden="true">👑</span>
                Top: {topPlayerName} &middot; {topPlayerXpText} XP
              </span>
              <span className="leaderboard-highlight-pill">
                <span role="img" aria-hidden="true">🎮</span>
                Most games: {mostGamesName} &middot; {mostGamesPlayedText} played
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
                <span className="leaderboard-col-xp">XP</span>
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
                      <span className="leaderboard-username">{entry.username}</span>
                      <span className="leaderboard-level-title">{entry.levelTitle}</span>
                    </span>

                    <span className="leaderboard-col-level">
                      <span className="leaderboard-level-badge">Lvl {entry.level}</span>
                    </span>

                    <span className="leaderboard-col-xp">
                      {entry.totalXp.toLocaleString()} <span className="leaderboard-xp-emoji" role="img" aria-hidden="true">⚡</span>
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
                      <span className="leaderboard-username">{userDoc?.username ?? 'You'}</span>
                      <span className="leaderboard-level-title">{levelTitle}</span>
                    </span>
                    <span className="leaderboard-col-level">
                      <span className="leaderboard-level-badge">Lvl {levelInfo.level}</span>
                    </span>
                    <span className="leaderboard-col-xp">
                      {totalXp.toLocaleString()} <span className="leaderboard-xp-emoji" role="img" aria-hidden="true">⚡</span>
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
