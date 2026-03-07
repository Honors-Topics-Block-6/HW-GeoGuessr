import type { Difficulty } from './MultiplayerLobby';
import type { PublicLobby } from '../../hooks/useLobby';

type DifficultyKey = Difficulty;

export type { PublicLobby };

export interface PublicGameListProps {
  lobbies: PublicLobby[];
  selectedDifficulty: DifficultyKey;
  onJoin: (gameId: string) => void;
  isJoining: boolean;
}

const DIFFICULTY_ORDER: DifficultyKey[] = ['easy', 'medium', 'hard', 'all'];

function PublicGameList({ lobbies, selectedDifficulty, onJoin, isJoining }: PublicGameListProps): React.ReactElement {
  if (lobbies.length === 0) {
    return (
      <div className="public-list-empty">
        <p>Empty right now.</p>
      </div>
    );
  }

  // Group lobbies by difficulty so we can keep a stable ordering
  const grouped: Record<string, PublicLobby[]> = {};
  for (const lobby of lobbies) {
    const diff = lobby.difficulty || 'all';
    if (!grouped[diff]) grouped[diff] = [];
    grouped[diff].push(lobby);
  }

  // Flatten into a single ordered list of lobbies
  const orderedLobbies: PublicLobby[] = [];
  for (const diff of DIFFICULTY_ORDER) {
    if (grouped[diff]) {
      orderedLobbies.push(...grouped[diff]);
    }
  }

  return (
    <div className="public-list">
      {orderedLobbies.map((lobby) => {
        const diff = lobby.difficulty || 'all';
        const isMatchingDifficulty = diff === selectedDifficulty;

        return (
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
              <span className="public-game-players">
                {(() => {
                  const gm = lobby.gameMode ?? 'duel';
                  const count = lobby.players?.length || 1;
                  return gm === 'duel' ? `${count}/2 players` : `${count} players`;
                })()}
              </span>
              {lobby.timePenaltyEnabled && (
                <span className="public-game-time-penalty" title="Time penalty enabled">⚡</span>
              )}
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
        );
      })}
    </div>
  );
}

export default PublicGameList;
