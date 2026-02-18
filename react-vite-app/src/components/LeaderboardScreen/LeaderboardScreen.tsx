import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getLeaderboard, getUserRank } from '../../services/leaderboardService';
import type { LeaderboardMetric } from '../../services/leaderboardService';
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
  const [metric, setMetric] = useState<LeaderboardMetric>('totalXp');

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard(): Promise<void> {
      try {
        const userMetricValue = metric === 'gamesPlayed'
          ? (userDoc?.gamesPlayed ?? 0)
          : totalXp;
        const [leaderboard, rank] = await Promise.all([
          getLeaderboard(50, metric),
          user ? getUserRank(user.uid, userMetricValue, metric) : Promise.resolve(null)
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
  }, [user, userDoc?.gamesPlayed, totalXp, metric]);

  const isCurrentUser = (uid: string): boolean => user?.uid === uid;
  const userInTop = entries.some((e: LeaderboardEntry) => isCurrentUser(e.uid));

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
          <span className="leaderboard-icon">🏆</span>
          <h1 className="leaderboard-title">Leaderboard</h1>
          <div className="leaderboard-filter">
            <label htmlFor="leaderboard-metric">Sort by</label>
            <select
              id="leaderboard-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as LeaderboardMetric)}
            >
              <option value="totalXp">Total XP</option>
              <option value="gamesPlayed">Games Played</option>
            </select>
          </div>
          {myRank && (
            <p className="leaderboard-my-rank">
              Your Rank: <strong>#{myRank}</strong>
            </p>
          )}
        </div>

        {loading && (
          <div className="leaderboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading leaderboard...</p>
          </div>
        )}

        {error && (
          <div className="leaderboard-error">{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="leaderboard-empty">
            <p>No players found yet. Be the first to play!</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
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
                    {entry.totalXp.toLocaleString()}
                  </span>

                  <span className="leaderboard-col-games">
                    {entry.gamesPlayed}
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
                    {totalXp.toLocaleString()}
                  </span>
                  <span className="leaderboard-col-games">
                    {userDoc?.gamesPlayed ?? 0}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaderboardScreen;
