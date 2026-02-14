import { useState } from 'react';
import { useLobby } from '../../hooks/useLobby';
import GameCodeInput from './GameCodeInput';
import PublicGameList from './PublicGameList';
import './MultiplayerLobby.css';

const DIFFICULTY_LABELS = {
  all: { label: 'All', icon: '🌐' },
  easy: { label: 'Easy', icon: '🟢' },
  medium: { label: 'Medium', icon: '🟡' },
  hard: { label: 'Hard', icon: '🔴' },
};

function MultiplayerLobby({ difficulty, userUid, userUsername, onJoinedLobby, onBack }) {
  const [visibility, setVisibility] = useState('public');
  const {
    publicLobbies,
    friendsLobbies,
    isCreating,
    isJoining,
    error,
    hostGame,
    joinByCode,
    joinPublicGame,
    clearError
  } = useLobby(userUid, userUsername, difficulty);

  const diffInfo = DIFFICULTY_LABELS[difficulty] || DIFFICULTY_LABELS.all;

  const handleHost = async () => {
    const result = await hostGame(visibility);
    if (result) {
      onJoinedLobby(result.docId);
    }
  };

  const handleJoinByCode = async (gameId) => {
    const result = await joinByCode(gameId);
    if (result) {
      onJoinedLobby(result.docId);
    }
  };

  const handleJoinPublic = async (docId) => {
    const success = await joinPublicGame(docId);
    if (success) {
      onJoinedLobby(docId);
    }
  };

  return (
    <div className="lobby-screen">
      <div className="lobby-background">
        <div className="lobby-overlay"></div>
      </div>

      <div className="lobby-content">
        <button className="lobby-back-button" onClick={onBack}>
          ← Back
        </button>

        <h1 className="lobby-heading">Multiplayer</h1>
        <div className="lobby-difficulty-badge">
          <span>{diffInfo.icon}</span>
          <span>{diffInfo.label} Difficulty</span>
        </div>

        {error && (
          <div className="lobby-error">
            <span>{error}</span>
            <button className="lobby-error-dismiss" onClick={clearError}>×</button>
          </div>
        )}

        <div className="lobby-panels">
          {/* Host a Game */}
          <div className="lobby-panel">
            <h2 className="lobby-panel-heading">Host a Game</h2>
            <p className="lobby-panel-desc">Create a new game and invite friends</p>

            <div className="lobby-visibility-toggle">
              <button
                className={`lobby-vis-btn ${visibility === 'public' ? 'selected' : ''}`}
                onClick={() => setVisibility('public')}
              >
                <span className="lobby-vis-icon">🌐</span>
                Public
              </button>
              <button
                className={`lobby-vis-btn ${visibility === 'friends' ? 'selected' : ''}`}
                onClick={() => setVisibility('friends')}
              >
                <span className="lobby-vis-icon">👥</span>
                Friends
              </button>
              <button
                className={`lobby-vis-btn ${visibility === 'private' ? 'selected' : ''}`}
                onClick={() => setVisibility('private')}
              >
                <span className="lobby-vis-icon">🔒</span>
                Private
              </button>
            </div>

            <button
              className="lobby-create-btn"
              onClick={handleHost}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <span className="lobby-spinner"></span>
                  Creating...
                </>
              ) : (
                'Create Game'
              )}
            </button>
          </div>

          {/* Join by Code */}
          <div className="lobby-panel">
            <h2 className="lobby-panel-heading">Join a Game</h2>
            <p className="lobby-panel-desc">Enter a game code to join</p>
            <GameCodeInput
              onJoin={handleJoinByCode}
              isJoining={isJoining}
            />
          </div>
        </div>

        {/* Browse Public Games */}
        <div className="lobby-public-section">
          <h2 className="lobby-section-heading">Public Games</h2>
          <p className="lobby-section-desc">
            Join an open game — only {diffInfo.label} difficulty games can be joined
          </p>
          <PublicGameList
            lobbies={publicLobbies}
            selectedDifficulty={difficulty}
            onJoin={handleJoinPublic}
            isJoining={isJoining}
          />
        </div>

        {/* Browse Friends' Games */}
        <div className="lobby-public-section">
          <h2 className="lobby-section-heading">Friends' Games</h2>
          <p className="lobby-section-desc">
            Games hosted by your friends — only {diffInfo.label} difficulty games can be joined
          </p>
          <PublicGameList
            lobbies={friendsLobbies}
            selectedDifficulty={difficulty}
            onJoin={handleJoinPublic}
            isJoining={isJoining}
          />
        </div>
      </div>
    </div>
  );
}

export default MultiplayerLobby;
