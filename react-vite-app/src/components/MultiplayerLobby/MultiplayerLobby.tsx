import { useEffect, useMemo, useState } from 'react';
import { useLobby, type HostGameExistingResult } from '../../hooks/useLobby';
import GameCodeInput from './GameCodeInput';
import PublicGameList from './PublicGameList';
import HostedGameConflictModal from '../HostedGameConflictModal/HostedGameConflictModal';
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
type PublicRoundTimeFilter = 'any' | '15' | '30' | '60' | '0';
type PublicTimePenaltyFilter = 'any' | 'on' | 'off';

/** Preset time options shown as buttons. 0 = no limit. */
interface TimePreset {
  value: number;
  label: string;
}

const TIME_PRESETS: TimePreset[] = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 0, label: 'No Limit' },
];

const CUSTOM_TIME_MIN = 3;
const CUSTOM_TIME_MAX = 600;

export interface MultiplayerLobbyProps {
  difficulty: Difficulty;
  userUid: string;
  userUsername: string;
  isGuest: boolean;
  onJoinedLobby: (docId: string) => void;
  onBack: () => void;
}

function MultiplayerLobby({ difficulty, userUid, userUsername, isGuest, onJoinedLobby, onBack }: MultiplayerLobbyProps): React.ReactElement {
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(difficulty);
  const [visibility, setVisibility] = useState<GameVisibility>('public');
  const [gameMode, setGameMode] = useState<'duel' | 'multiplayer'>('duel');
  const [timeSelection, setTimeSelection] = useState<number | 'custom'>(30);
  const [customTime, setCustomTime] = useState<string>('60');
  const [timePenaltyEnabled, setTimePenaltyEnabled] = useState<boolean>(false);
  const [publicDifficultyFilter, setPublicDifficultyFilter] = useState<PublicDifficultyFilter>('any');
  const [publicRoundTimeFilter, setPublicRoundTimeFilter] = useState<PublicRoundTimeFilter>('any');
  const [publicTimePenaltyFilter, setPublicTimePenaltyFilter] = useState<PublicTimePenaltyFilter>('any');
  const [conflictLobbies, setConflictLobbies] = useState<HostGameExistingResult['existingLobbies'] | null>(null);

  useEffect(() => {
    setSelectedDifficulty(difficulty);
  }, [difficulty]);

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
    if (isGuest && visibility === 'public') {
      setVisibility('private');
    }
  }, [isGuest, visibility]);

  const {
    publicLobbies,
    isCreating,
    isJoining,
    error,
    hostGame,
    joinByCode,
    closeHostedLobby,
    clearError
  } = useLobby(userUid, userUsername, selectedDifficulty, timePenaltyEnabled, isGuest);

  const handleHost = async (): Promise<void> => {
    const result = await hostGame(visibility, resolvedTime, gameMode);
    if (result) {
      if ('existingLobbies' in result) {
        setConflictLobbies(result.existingLobbies);
      } else {
        onJoinedLobby(result.docId);
      }
    }
  };

  const handleJoinByCode = async (gameId: string): Promise<void> => {
    const result = await joinByCode(gameId);
    if (result) {
      onJoinedLobby(result.docId);
    }
  };

  const handleJoinPublic = async (gameId: string): Promise<void> => {
    const result = await joinByCode(gameId);
    if (result) {
      onJoinedLobby(result.docId);
    }
  };

  const filteredPublicLobbies = useMemo(() => {
    return publicLobbies.filter((lobby) => {
      if (publicDifficultyFilter !== 'any' && lobby.difficulty !== publicDifficultyFilter) {
        return false;
      }
      if (publicRoundTimeFilter !== 'any' && String(lobby.roundTimeSeconds ?? '') !== publicRoundTimeFilter) {
        return false;
      }
      if (publicTimePenaltyFilter !== 'any') {
        const hasPenalty = !!lobby.timePenaltyEnabled;
        if (publicTimePenaltyFilter === 'on' && !hasPenalty) return false;
        if (publicTimePenaltyFilter === 'off' && hasPenalty) return false;
      }
      return true;
    });
  }, [publicLobbies, publicDifficultyFilter, publicRoundTimeFilter, publicTimePenaltyFilter]);

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

        {error && (
          <div className="lobby-error">
            <span>{error}</span>
            <button className="lobby-error-dismiss" onClick={clearError}>×</button>
          </div>
        )}

        {/* Host a Game */}
        <div className="lobby-panel lobby-panel-host">
          <h2 className="lobby-panel-heading">Host a Game</h2>

          <div className="lobby-host-difficulty">
            <div className="lobby-host-difficulty-options">
              {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((diff) => (
                <button
                  key={diff}
                  className={`lobby-host-difficulty-card ${selectedDifficulty === diff ? 'selected' : ''}`}
                  onClick={() => setSelectedDifficulty(diff)}
                >
                  <span className="lobby-host-difficulty-icon">{DIFFICULTY_LABELS[diff].icon}</span>
                  <span className="lobby-host-difficulty-name">{DIFFICULTY_LABELS[diff].label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lobby-game-mode">
            <div className="lobby-game-mode-options">
              <button
                type="button"
                className={`lobby-game-mode-btn ${gameMode === 'duel' ? 'selected' : ''}`}
                onClick={() => setGameMode('duel')}
                disabled={isCreating}
              >
                <span className="lobby-game-mode-icon">⚔️</span>
                <span className="lobby-game-mode-name">Duel</span>
              </button>
              <button
                type="button"
                className={`lobby-game-mode-btn ${gameMode === 'multiplayer' ? 'selected' : ''}`}
                onClick={() => setGameMode('multiplayer')}
                disabled={isCreating}
              >
                <span className="lobby-game-mode-icon">👥</span>
                <span className="lobby-game-mode-name">Multiplayer</span>
              </button>
            </div>
          </div>

          <div className="lobby-visibility-toggle">
            <button
              className={`lobby-vis-btn ${visibility === 'public' ? 'selected' : ''} ${isGuest ? 'lobby-vis-btn-disabled' : ''}`}
              onClick={() => !isGuest && setVisibility('public')}
              disabled={isGuest}
              title={isGuest ? 'Sign in to create public games' : undefined}
            >
              <span className="lobby-vis-icon">🌐</span>
              Public
              {isGuest && <span className="lobby-vis-guest-hint">(Sign in)</span>}
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
              {timeSelection === 'custom' ? (
                <div className="lobby-time-input-wrapper selected">
                  <input
                    className="lobby-time-input"
                    type="text"
                    inputMode="numeric"
                    value={customTime}
                    onChange={(e) => handleCustomTimeChange(e.target.value)}
                    onBlur={handleCustomTimeBlur}
                    placeholder="Custom"
                    autoFocus
                  />
                  <span className="lobby-time-unit">s</span>
                </div>
              ) : (
                <button
                  className="lobby-time-btn"
                  onClick={() => setTimeSelection('custom')}
                  aria-label="Custom time"
                >
                  Custom
                </button>
              )}
            </div>
          </div>

          <div className="lobby-time-penalty-section">
            <span className="lobby-time-penalty-label">Time penalty</span>
            <div className="lobby-time-penalty-toggle">
              <button
                className={`lobby-time-penalty-btn ${!timePenaltyEnabled ? 'selected' : ''}`}
                onClick={() => setTimePenaltyEnabled(false)}
              >
                Off
              </button>
              <button
                className={`lobby-time-penalty-btn ${timePenaltyEnabled ? 'selected' : ''}`}
                onClick={() => setTimePenaltyEnabled(true)}
              >
                On
              </button>
            </div>
          </div>

          <button
            className="lobby-create-btn"
            onClick={handleHost}
            disabled={isCreating || (isGuest && visibility === 'public')}
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
          {/* Join by Code (top-left) */}
          <div className="lobby-panel lobby-panel-join">
            <h2 className="lobby-panel-heading">Join a Game</h2>
            <GameCodeInput
              onJoin={handleJoinByCode}
              isJoining={isJoining}
            />
          </div>

          {/* Public filters (top-right) */}
          <div className="lobby-panel lobby-public-filters-panel">
            <h2 className="lobby-section-heading">Public Games</h2>
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
                  <option value="15">15s</option>
                  <option value="30">30s</option>
                  <option value="60">60s</option>
                  <option value="0">No Limit</option>
                </select>
              </label>
              <label className="lobby-public-filter-item">
                <span>Time Penalty</span>
                <select
                  className="lobby-public-filter-select"
                  value={publicTimePenaltyFilter}
                  onChange={(e) => setPublicTimePenaltyFilter(e.target.value as PublicTimePenaltyFilter)}
                >
                  <option value="any">Any</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
            </div>
          </div>

          {/* Public games list (full width, two-wide inside) */}
          <div className="lobby-panel lobby-public-list-panel">
            <PublicGameList
              lobbies={filteredPublicLobbies}
              selectedDifficulty={selectedDifficulty}
              onJoin={handleJoinPublic}
              isJoining={isJoining}
            />
          </div>
        </div>
      </div>

      {conflictLobbies && conflictLobbies.length > 0 && (
        <HostedGameConflictModal
          existingLobbies={conflictLobbies}
          onClose={() => setConflictLobbies(null)}
          onCloseHostedGame={closeHostedLobby}
          onGoToLobby={(docId) => onJoinedLobby(docId)}
        />
      )}
    </div>
  );
}

export default MultiplayerLobby;
