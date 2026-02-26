import { useState } from 'react';
import './DifficultySelect.css';

type DifficultyId = 'all' | 'easy' | 'medium' | 'hard';
type GameMode = 'singleplayer' | 'multiplayer';

/** 0 means "no time limit" */
export type RoundTimeSeconds = number;

interface DifficultyOption {
  id: DifficultyId;
  label: string;
  icon: string;
  description: string;
}

/** Preset time options shown as buttons. 0 = no limit. */
interface TimePreset {
  value: number;
  label: string;
}

const DIFFICULTIES: DifficultyOption[] = [
  {
    id: 'all',
    label: 'All',
    icon: '🌐',
    description: 'Any photo, any difficulty',
  },
  {
    id: 'easy',
    label: 'Easy',
    icon: '🟢',
    description: 'Familiar spots around campus',
  },
  {
    id: 'medium',
    label: 'Medium',
    icon: '🟡',
    description: 'Trickier angles and locations',
  },
  {
    id: 'hard',
    label: 'Hard',
    icon: '🔴',
    description: 'Only true experts will know these',
  },
];

const TIME_PRESETS: TimePreset[] = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 0, label: 'No Limit' },
];

const CUSTOM_TIME_MIN = 3;
const CUSTOM_TIME_MAX = 600;

export interface DifficultySelectProps {
  onStart: (difficulty: DifficultyId, mode: GameMode, roundTimeSeconds: RoundTimeSeconds) => void;
  onBack: () => void;
  isLoading: boolean;
}

function DifficultySelect({ onStart, onBack, isLoading }: DifficultySelectProps): React.ReactElement {
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId>('all');
  const [selectedMode, setSelectedMode] = useState<GameMode>('singleplayer');

  // Time setting: preset value or 'custom'
  const [timeSelection, setTimeSelection] = useState<number | 'custom'>(30);
  const [customTime, setCustomTime] = useState<string>('60');
  const [customTimeError, setCustomTimeError] = useState<string | null>(null);

  const parsedCustom = parseInt(customTime, 10);
  const customIsValid =
    timeSelection !== 'custom' ||
    (!isNaN(parsedCustom) && parsedCustom >= CUSTOM_TIME_MIN && parsedCustom <= CUSTOM_TIME_MAX);

  /** Resolve the actual round time in seconds (0 = no limit) */
  const resolvedTime: number =
    timeSelection === 'custom'
      ? Math.max(
          CUSTOM_TIME_MIN,
          Math.min(
            CUSTOM_TIME_MAX,
            isNaN(parsedCustom) ? CUSTOM_TIME_MIN : parsedCustom
          )
        )
      : timeSelection;

  const handleStart = (): void => {
    if (!selectedDifficulty) return;

    if (timeSelection === 'custom') {
      if (!customIsValid) {
        setCustomTimeError(`Enter a time between ${CUSTOM_TIME_MIN} and ${CUSTOM_TIME_MAX} seconds.`);
        return;
      }
      // Normalize the input to the clamped value so the user sees what will be used
      setCustomTime(String(resolvedTime));
      setCustomTimeError(null);
    }

    onStart(selectedDifficulty, selectedMode, resolvedTime);
  };

  const disabledReason: string | null = (() => {
    if (!selectedDifficulty) return 'Select a difficulty.';
    if (!selectedMode) return 'Select a game mode.';
    if (timeSelection === 'custom' && !customIsValid) {
      return `Enter a custom time between ${CUSTOM_TIME_MIN} and ${CUSTOM_TIME_MAX} seconds.`;
    }
    return null;
  })();

  const handleCustomTimeChange = (value: string): void => {
    // Allow only digits while typing
    const digits = value.replace(/\D/g, '');
    setCustomTime(digits);
    setCustomTimeError(null);
  };

  const handleCustomTimeBlur = (): void => {
    const parsed = parseInt(customTime, 10);
    if (isNaN(parsed) || parsed < CUSTOM_TIME_MIN) {
      setCustomTime(String(CUSTOM_TIME_MIN));
      setCustomTimeError(null);
    } else if (parsed > CUSTOM_TIME_MAX) {
      setCustomTime(String(CUSTOM_TIME_MAX));
      setCustomTimeError(null);
    }
  };

  return (
    <div className="difficulty-screen">
      <div className="difficulty-background">
        <div className="difficulty-overlay"></div>
      </div>

      <div className="difficulty-content">
        <button className="difficulty-back-button" onClick={onBack}>
          ← Back
        </button>

        <h2 className="difficulty-heading">Choose Difficulty</h2>
        <p className="difficulty-subheading">Select how challenging you want the game to be</p>

        <div className="difficulty-options">
          {DIFFICULTIES.map((diff: DifficultyOption) => (
            <button
              key={diff.id}
              className={`difficulty-card ${selectedDifficulty === diff.id ? 'selected' : ''}`}
              onClick={() => setSelectedDifficulty(diff.id)}
            >
              <span className="difficulty-card-icon">{diff.icon}</span>
              <span className="difficulty-card-label">{diff.label}</span>
              <span className="difficulty-card-desc">{diff.description}</span>
            </button>
          ))}
        </div>

        <h2 className="mode-heading">Game Mode</h2>

        <div className="mode-options">
          <button
            className={`mode-card mode-singleplayer ${selectedMode === 'singleplayer' ? 'selected' : ''}`}
            onClick={() => setSelectedMode('singleplayer')}
          >
            <span className="mode-card-icon">👤</span>
            <span className="mode-card-label">Singleplayer</span>
          </button>

          <button
            className={`mode-card mode-multiplayer ${selectedMode === 'multiplayer' ? 'selected' : ''}`}
            onClick={() => setSelectedMode('multiplayer')}
          >
            <span className="mode-card-icon">👥</span>
            <span className="mode-card-label">Multiplayer</span>
          </button>
        </div>

        {selectedMode === 'singleplayer' && (
          <>
            <h2 className="time-heading">Round Time</h2>
            <p className="time-subheading">How long each round lasts</p>

            <div className="time-options">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  className={`time-card ${timeSelection === preset.value ? 'selected' : ''}`}
                  onClick={() => setTimeSelection(preset.value)}
                >
                  <span className="time-card-icon">
                    {preset.value === 0 ? '∞' : '⏱'}
                  </span>
                  <span className="time-card-label">{preset.label}</span>
                </button>
              ))}
              <button
                className={`time-card ${timeSelection === 'custom' ? 'selected' : ''}`}
                onClick={() => setTimeSelection('custom')}
              >
                <span className="time-card-icon">✏️</span>
                <span className="time-card-label">Custom</span>
              </button>
            </div>

            {timeSelection === 'custom' && (
              <div className="time-custom-input-wrapper">
                <label className="time-custom-label" htmlFor="custom-time-input">
                  Seconds ({CUSTOM_TIME_MIN}–{CUSTOM_TIME_MAX})
                </label>
                <input
                  id="custom-time-input"
                  className="time-custom-input"
                  type="text"
                  inputMode="numeric"
                  value={customTime}
                  onChange={(e) => handleCustomTimeChange(e.target.value)}
                  onBlur={handleCustomTimeBlur}
                  min={CUSTOM_TIME_MIN}
                  max={CUSTOM_TIME_MAX}
                  placeholder="e.g. 60"
                />
                {customTimeError && <div className="time-custom-error">{customTimeError}</div>}
              </div>
            )}
          </>
        )}

        <div className="difficulty-footer">
          <button
            className="play-button"
            onClick={handleStart}
            disabled={!selectedDifficulty || isLoading}
          >
            {isLoading ? (
              <>
                <span className="button-spinner"></span>
                Loading...
              </>
            ) : (
              'Play'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DifficultySelect;
