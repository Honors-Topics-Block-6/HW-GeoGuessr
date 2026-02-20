import { useState } from 'react';
import { useLobby } from '../../hooks/useLobby';
import GameCodeInput from './GameCodeInput';
import PublicGameList from './PublicGameList';
import type { MultiplayerSettings } from '../../hooks/useGameState';
import './MultiplayerLobby.css';

export type Difficulty = 'all' | 'easy' | 'medium' | 'hard';

interface DifficultyInfo {
  label: string;
  icon: string;
}

const DIFFICULTY_LABELS: Record<Difficulty, DifficultyInfo> = {
  all: { label: 'All', icon: '🌐' },
  easy: { label: 'Easy', icon: '🟢' },
  medium: { label: 'Medium', icon: '🟡' },
  hard: { label: 'Hard', icon: '🔴' },
};

export type GameVisibility = 'public' | 'private';

export interface MultiplayerLobbyProps {
  difficulty: Difficulty;
  userUid: string;
  userUsername: string;
  settings: MultiplayerSettings;
  onJoinedLobby: (docId: string) => void;
  onBack: () => void;
}

function MultiplayerLobby({ difficulty, userUid, userUsername, settings, onJoinedLobby, onBack }: MultiplayerLobbyProps): React.ReactElement {
  const [visibility, setVisibility] = useState<GameVisibility>('public');
  const {
    publicLobbies,
    isCreating,
    isJoining,
    error,
    hostGame,
    joinByCode,
    joinPublicGame,
    clearError
  } = useLobby(userUid, userUsername, difficulty, settings);

  const diffInfo: DifficultyInfo = DIFFICULTY_LABELS[difficulty] || DIFFICULTY_LABELS.all;

  const handleHost = async (): Promise<void> => {
    const result = await hostGame(visibility);
    if (result) {
      onJoinedLobby(result.docId);
    }
  };

  const handleJoinByCode = async (gameId: string): Promise<void> => {
    const result = await joinByCode(gameId);
    if (result) {
      onJoinedLobby(result.docId);
    }
  };

  const handleJoinPublic = async (docId: string): Promise<void> => {
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
      </div>
    </div>
  );
}

export default MultiplayerLobby;
