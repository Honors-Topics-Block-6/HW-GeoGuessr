const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'all'];

const DIFFICULTY_META = {
  all: { label: 'All', icon: '🌐', color: '#3498db' },
  easy: { label: 'Easy', icon: '🟢', color: '#2ecc71' },
  medium: { label: 'Medium', icon: '🟡', color: '#f39c12' },
  hard: { label: 'Hard', icon: '🔴', color: '#e74c3c' },
};

function PublicGameList({ lobbies, selectedDifficulty, onJoin, isJoining }) {
  if (lobbies.length === 0) {
    return (
      <div className="public-list-empty">
        <span className="public-list-empty-icon">📭</span>
        <p>No public games available right now.</p>
        <p className="public-list-empty-hint">Try hosting your own game!</p>
      </div>
    );
  }

  // Group lobbies by difficulty
  const grouped = {};
  for (const lobby of lobbies) {
    const diff = lobby.difficulty || 'all';
    if (!grouped[diff]) grouped[diff] = [];
    grouped[diff].push(lobby);
  }

  // Sort difficulty sections by predefined order
  const sortedKeys = DIFFICULTY_ORDER.filter(d => grouped[d]);

  return (
    <div className="public-list">
      {sortedKeys.map(diff => {
        const meta = DIFFICULTY_META[diff] || DIFFICULTY_META.all;
        const isMatchingDifficulty = diff === selectedDifficulty;

        return (
          <div key={diff} className="public-list-section">
            <div className="public-list-section-header">
              <span
                className="public-list-diff-badge"
                style={{ borderColor: meta.color, color: meta.color }}
              >
                {meta.icon} {meta.label}
              </span>
              <span className="public-list-section-count">
                {grouped[diff].length} game{grouped[diff].length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="public-list-games">
              {grouped[diff].map(lobby => (
                <div
                  key={lobby.docId}
                  className={`public-game-card ${!isMatchingDifficulty ? 'disabled' : ''}`}
                >
                  <div className="public-game-info">
                    <span className="public-game-host">
                      <span className="public-game-host-icon">👤</span>
                      {lobby.hostUsername}
                    </span>
                    <span className="public-game-players">
                      {lobby.players?.length || 1}/{lobby.maxPlayers || 8} players
                    </span>
                  </div>
                  <button
                    className="public-game-join-btn"
                    onClick={() => onJoin(lobby.docId)}
                    disabled={!isMatchingDifficulty || isJoining}
                    title={
                      !isMatchingDifficulty
                        ? `You selected "${selectedDifficulty}" — this game is "${diff}"`
                        : 'Join this game'
                    }
                  >
                    {isMatchingDifficulty ? 'Join' : 'Wrong Difficulty'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PublicGameList;
