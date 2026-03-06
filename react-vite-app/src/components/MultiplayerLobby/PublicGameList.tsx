import type { Difficulty } from './MultiplayerLobby';
import type { PublicLobby } from '../../hooks/useLobby';

type DifficultyKey = Difficulty;

interface DifficultyMeta {
  label: string;
  icon: string;
  color: string;
}

export type { PublicLobby };

export interface PublicGameListProps {
  lobbies: PublicLobby[];
  selectedDifficulty: DifficultyKey;
  onJoin: (gameId: string) => void;
  isJoining: boolean;
}

const DIFFICULTY_ORDER: DifficultyKey[] = ['easy', 'medium', 'hard', 'all'];

const DIFFICULTY_META: Record<DifficultyKey, DifficultyMeta> = {
  all: { label: 'All', icon: '🌐', color: '#3498db' },
  easy: { label: 'Easy', icon: '🟢', color: '#2ecc71' },
  medium: { label: 'Medium', icon: '🟡', color: '#f39c12' },
  hard: { label: 'Hard', icon: '🔴', color: '#e74c3c' },
};

function PublicGameList({ lobbies, selectedDifficulty, onJoin, isJoining }: PublicGameListProps): React.ReactElement {
  if (lobbies.length === 0) {
    return (
      <div className="public-list-empty">
        <p>Empty right now.</p>
      </div>
    );
  }

  // Group lobbies by difficulty
  const grouped: Record<string, PublicLobby[]> = {};
  for (const lobby of lobbies) {
    const diff = lobby.difficulty || 'all';
    if (!grouped[diff]) grouped[diff] = [];
    grouped[diff].push(lobby);
  }

  // Sort difficulty sections by predefined order
  const sortedKeys = DIFFICULTY_ORDER.filter((d) => grouped[d]);

  return (
    <div className="public-list">
      {sortedKeys.map((diff) => {
        const meta: DifficultyMeta = DIFFICULTY_META[diff] || DIFFICULTY_META.all;
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
              {grouped[diff].map((lobby) => (
                <div
                  key={lobby.docId}
                  className={`public-game-card ${!isMatchingDifficulty ? 'disabled' : ''}`}
                >
                  <div className="public-game-info">
                    <span className="public-game-host">
                      <span className="public-game-host-icon">👤</span>
                      {lobby.hostUsername}
                    </span>
                    <span className="public-game-code">
                      <span className="public-game-code-label">Code</span>
                      <span className="public-game-code-value">{lobby.gameId}</span>
                    </span>
                  </div>
                  <button
                    className="public-game-join-btn"
                    onClick={() => onJoin(lobby.gameId)}
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
