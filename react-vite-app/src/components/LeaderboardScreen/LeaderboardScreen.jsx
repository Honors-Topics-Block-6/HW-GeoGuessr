import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getLeaderboard, getUserRank } from '../../services/leaderboardService';
import './LeaderboardScreen.css';

function LeaderboardScreen({ onBack }) {
  const { user, userDoc, totalXp, levelInfo, levelTitle } = useAuth();

  const [entries, setEntries] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      try {
        const [leaderboard, rank] = await Promise.all([
          getLeaderboard(50),
          user ? getUserRank(user.uid, totalXp) : Promise.resolve(null)
        ]);

        if (!cancelled) {
          setEntries(leaderboard);
          setMyRank(rank);
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

  const isCurrentUser = (uid) => user?.uid === uid;
  const userInTop = entries.some((e) => isCurrentUser(e.uid));

  const getMedalEmoji = (rank) => {
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

            {entries.map((entry) => {
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
