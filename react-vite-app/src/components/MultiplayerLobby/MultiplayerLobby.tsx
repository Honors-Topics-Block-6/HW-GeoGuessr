import { useEffect, useMemo, useState } from 'react';
import { useLobby } from '../../hooks/useLobby';
import GameCodeInput from './GameCodeInput';
import PublicGameList from './PublicGameList';
import './MultiplayerLobby.css';

export type Difficulty = 'all' | 'easy' | 'medium' | 'hard';

interface DifficultyInfo {
  label: string;
  icon: string;
  description: string;
}

const DIFFICULTY_LABELS: Record<Difficulty, DifficultyInfo> = {
  all: { label: 'All', icon: '🌐', description: 'Any photo, any difficulty' },
  easy: { label: 'Easy', icon: '🟢', description: 'Familiar spots around campus' },
  medium: { label: 'Medium', icon: '🟡', description: 'Trickier angles and locations' },
  hard: { label: 'Hard', icon: '🔴', description: 'Only true experts will know these' },
};

export type GameVisibility = 'public' | 'private';
type PublicDifficultyFilter = 'any' | Difficulty;
type PublicRoundTimeFilter = 'any' | '10' | '20' | '30' | '0';

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
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(difficulty);
  const [visibility, setVisibility] = useState<GameVisibility>('public');
  const [timeSelection, setTimeSelection] = useState<number | 'custom'>(20);
  const [customTime, setCustomTime] = useState<string>('60');
  const [publicDifficultyFilter, setPublicDifficultyFilter] = useState<PublicDifficultyFilter>('any');
  const [publicRoundTimeFilter, setPublicRoundTimeFilter] = useState<PublicRoundTimeFilter>('any');

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
  useEffect(() => {
    setSelectedDifficulty(difficulty);
  }, [difficulty]);

  const {
    publicLobbies,
    isCreating,
    isJoining,
    error,
    hostGame,
    joinByCode,
    joinPublicGame,
    clearError
  } = useLobby(userUid, userUsername, selectedDifficulty);

  const diffInfo: DifficultyInfo = DIFFICULTY_LABELS[selectedDifficulty] || DIFFICULTY_LABELS.all;

  const handleHost = async (): Promise<void> => {
    const result = await hostGame(visibility, resolvedTime);
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

  const filteredPublicLobbies = useMemo(() => {
    return publicLobbies.filter((lobby) => {
      const lobbyDifficulty = (lobby.difficulty || 'all') as Difficulty;
      const lobbyRoundTime = typeof lobby.roundTimeSeconds === 'number' ? lobby.roundTimeSeconds : 20;

      const difficultyMatch =
        publicDifficultyFilter === 'any' || lobbyDifficulty === publicDifficultyFilter;

      const roundTimeMatch =
        publicRoundTimeFilter === 'any' || lobbyRoundTime === Number(publicRoundTimeFilter);

      return difficultyMatch && roundTimeMatch;
    });
  }, [publicDifficultyFilter, publicLobbies, publicRoundTimeFilter]);

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

        {/* Host a Game */}
        <div className="lobby-panel lobby-panel-host">
          <h2 className="lobby-panel-heading">Host a Game</h2>
          <p className="lobby-panel-desc">Create a new game and invite friends</p>

          <div className="lobby-host-difficulty">
            <p className="lobby-time-label">Difficulty</p>
            <div className="lobby-host-difficulty-options">
              {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((diff) => (
                <button
                  key={diff}
                  className={`lobby-host-difficulty-card ${selectedDifficulty === diff ? 'selected' : ''}`}
                  onClick={() => setSelectedDifficulty(diff)}
                >
                  <span className="lobby-host-difficulty-icon">{DIFFICULTY_LABELS[diff].icon}</span>
                  <span className="lobby-host-difficulty-name">{DIFFICULTY_LABELS[diff].label}</span>
                  <span className="lobby-host-difficulty-desc">{DIFFICULTY_LABELS[diff].description}</span>
                </button>
              ))}
            </div>
          </div>

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

        <div className="lobby-bottom-sections">
          {/* Join by Code */}
          <div className="lobby-panel lobby-panel-join">
            <h2 className="lobby-panel-heading">Join a Game</h2>
            <p className="lobby-panel-desc">Enter a game code to join</p>
            <GameCodeInput
              onJoin={handleJoinByCode}
              isJoining={isJoining}
            />
          </div>

        {/* Browse Public Games */}
        <div className="lobby-public-section">
          <h2 className="lobby-section-heading">Public Games</h2>
          <p className="lobby-section-desc">
            Join an open game — only {diffInfo.label} difficulty games can be joined
          </p>
          <div className="lobby-public-filters">
            <label className="lobby-public-filter-item">
              <span>Difficulty</span>
              <select
                className="lobby-public-filter-select"
                value={publicDifficultyFilter}
                onChange={(e) => setPublicDifficultyFilter(e.target.value as PublicDifficultyFilter)}
              >
                <option value="any">Any</option>
                <option value="all">All</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="lobby-public-filter-item">
              <span>Round Time</span>
              <select
                className="lobby-public-filter-select"
                value={publicRoundTimeFilter}
                onChange={(e) => setPublicRoundTimeFilter(e.target.value as PublicRoundTimeFilter)}
              >
                <option value="any">Any</option>
                <option value="10">10s</option>
                <option value="20">20s</option>
                <option value="30">30s</option>
                <option value="0">No Limit</option>
              </select>
            </label>
          </div>
          <PublicGameList
            lobbies={filteredPublicLobbies}
            selectedDifficulty={difficulty}
            onJoin={handleJoinPublic}
            isJoining={isJoining}
          />
        </div>
      </div>
    </div>
    </div>
  );
}

export default MultiplayerLobby;
