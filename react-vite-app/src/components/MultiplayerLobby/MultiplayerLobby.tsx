import { useState } from 'react';
import { useLobby } from '../../hooks/useLobby';
import GameCodeInput from './GameCodeInput';
import PublicGameList from './PublicGameList';
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

/** Preset time options shown as buttons. 0 = no limit. */
interface TimePreset {
  value: number;
  label: string;
}

const TIME_PRESETS: TimePreset[] = [
  { value: 10, label: '10s' },
  { value: 20, label: '20s' },
  { value: 30, label: '30s' },
  { value: 0, label: 'No Limit' },
];

const CUSTOM_TIME_MIN = 3;
const CUSTOM_TIME_MAX = 600;

export interface MultiplayerLobbyProps {
  difficulty: Difficulty;
  userUid: string;
  userUsername: string;
  onJoinedLobby: (docId: string) => void;
  onBack: () => void;
}

function MultiplayerLobby({ difficulty, userUid, userUsername, onJoinedLobby, onBack }: MultiplayerLobbyProps): React.ReactElement {
  const [visibility, setVisibility] = useState<GameVisibility>('public');
<<<<<<< Updated upstream
  const [timeSelection, setTimeSelection] = useState<number | 'custom'>(20);
  const [customTime, setCustomTime] = useState<string>('60');

  /** Resolve the actual round time in seconds (0 = no limit) */
  const resolvedTime: number =
    timeSelection === 'custom'
      ? Math.max(CUSTOM_TIME_MIN, Math.min(CUSTOM_TIME_MAX, parseInt(customTime, 10) || CUSTOM_TIME_MIN))
      : timeSelection;

  const handleCustomTimeChange = (value: string): void => {
    const digits = value.replace(/\D/g, '');
    setCustomTime(digits);
  };

  const handleCustomTimeBlur = (): void => {
    const parsed = parseInt(customTime, 10);
    if (isNaN(parsed) || parsed < CUSTOM_TIME_MIN) {
      setCustomTime(String(CUSTOM_TIME_MIN));
    } else if (parsed > CUSTOM_TIME_MAX) {
      setCustomTime(String(CUSTOM_TIME_MAX));
    }
  };
=======
  const [maxPlayers, setMaxPlayers] = useState<number>(2);
>>>>>>> Stashed changes
  const {
    publicLobbies,
    isCreating,
    isJoining,
    error,
    hostGame,
    joinByCode,
    joinPublicGame,
    clearError
  } = useLobby(userUid, userUsername, difficulty);

  const diffInfo: DifficultyInfo = DIFFICULTY_LABELS[difficulty] || DIFFICULTY_LABELS.all;

  const handleHost = async (): Promise<void> => {
<<<<<<< Updated upstream
    const result = await hostGame(visibility, resolvedTime);
=======
    const result = await hostGame(visibility, maxPlayers);
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
            {/* Round Time */}
            <div className="lobby-time-section">
              <p className="lobby-time-label">Round Time</p>
              <div className="lobby-time-options">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className={`lobby-time-btn ${timeSelection === preset.value ? 'selected' : ''}`}
                    onClick={() => setTimeSelection(preset.value)}
                  >
                    {preset.value === 0 ? '∞' : `${preset.label}`}
                  </button>
                ))}
                <button
                  className={`lobby-time-btn ${timeSelection === 'custom' ? 'selected' : ''}`}
                  onClick={() => setTimeSelection('custom')}
                >
                  ✏️
                </button>
              </div>
              {timeSelection === 'custom' && (
                <div className="lobby-time-custom">
                  <input
                    className="lobby-time-custom-input"
                    type="text"
                    inputMode="numeric"
                    value={customTime}
                    onChange={(e) => handleCustomTimeChange(e.target.value)}
                    onBlur={handleCustomTimeBlur}
                    placeholder="e.g. 60"
                  />
                  <span className="lobby-time-custom-hint">
                    {CUSTOM_TIME_MIN}–{CUSTOM_TIME_MAX}s
                  </span>
                </div>
              )}
=======
            <div className="lobby-max-players">
              <label className="lobby-max-players-label" htmlFor="lobby-max-players-select">
                Players
              </label>
              <select
                id="lobby-max-players-select"
                className="lobby-max-players-select"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value, 10))}
                disabled={isCreating}
              >
                {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
>>>>>>> Stashed changes
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
