import { useState } from 'react';
import './DifficultySelect.css';

type DifficultyId = 'all' | 'easy' | 'medium' | 'hard';
type GameMode = 'singleplayer' | 'multiplayer';
type MultiplayerTimingRule = 'simultaneous' | 'afterFirstGuess';

export interface GameSetupSettings {
  totalRounds: number;
  roundTimeSeconds: number;
  multiplayerTimingRule: MultiplayerTimingRule;
  afterFirstGuessSeconds: number;
}

interface DifficultyOption {
  id: DifficultyId;
  label: string;
  icon: string;
  description: string;
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

export interface DifficultySelectProps {
  onStart: (difficulty: DifficultyId, mode: GameMode, settings: GameSetupSettings) => void;
  onBack: () => void;
  isLoading: boolean;
}

function DifficultySelect({ onStart, onBack, isLoading }: DifficultySelectProps): React.ReactElement {
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameMode>('singleplayer');
  const [roundTimeSeconds, setRoundTimeSeconds] = useState<number>(20);
  const [totalRounds, setTotalRounds] = useState<number>(5);
  const [multiplayerTimingRule, setMultiplayerTimingRule] = useState<MultiplayerTimingRule>('simultaneous');
  const [afterFirstGuessSeconds, setAfterFirstGuessSeconds] = useState<number>(10);

  const handleStart = (): void => {
    if (selectedDifficulty) {
      onStart(selectedDifficulty, selectedMode, {
        totalRounds,
        roundTimeSeconds,
        multiplayerTimingRule,
        afterFirstGuessSeconds
      });
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

        {/* Settings */}
        <div className="game-settings">
          <h3 className="game-settings-heading">Game Settings</h3>

          <div className="game-settings-grid">
            <div className="game-setting">
              <label className="game-setting-label" htmlFor="round-time">
                Time per round
              </label>
              <select
                id="round-time"
                className="game-setting-select"
                value={roundTimeSeconds}
                onChange={(e) => setRoundTimeSeconds(Number(e.target.value))}
              >
                {[10, 15, 20, 30, 45, 60].map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            </div>

            <div className="game-setting">
              <label className="game-setting-label" htmlFor="round-count">
                Rounds (singleplayer)
              </label>
              <select
                id="round-count"
                className="game-setting-select"
                value={totalRounds}
                onChange={(e) => setTotalRounds(Number(e.target.value))}
                disabled={selectedMode !== 'singleplayer'}
                title={selectedMode !== 'singleplayer' ? 'Rounds only apply to singleplayer games' : undefined}
              >
                {[3, 5, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="game-setting game-setting-wide">
              <label className="game-setting-label" htmlFor="mp-timing">
                Multiplayer timing
              </label>
              <select
                id="mp-timing"
                className="game-setting-select"
                value={multiplayerTimingRule}
                onChange={(e) => setMultiplayerTimingRule(e.target.value as MultiplayerTimingRule)}
                disabled={selectedMode !== 'multiplayer'}
                title={selectedMode !== 'multiplayer' ? 'Multiplayer timing only applies to multiplayer games' : undefined}
              >
                <option value="simultaneous">Same timer for everyone</option>
                <option value="afterFirstGuess">Start countdown after first guess</option>
              </select>
              {selectedMode === 'multiplayer' && multiplayerTimingRule === 'afterFirstGuess' && (
                <div className="game-setting-subrow">
                  <span className="game-setting-subtext">Countdown length:</span>
                  <select
                    className="game-setting-select small"
                    value={afterFirstGuessSeconds}
                    onChange={(e) => setAfterFirstGuessSeconds(Number(e.target.value))}
                  >
                    {[5, 10, 15, 20].map((s) => (
                      <option key={s} value={s}>{s}s</option>
                    ))}
                  </select>
                </div>
              )}
              {selectedMode === 'multiplayer' && multiplayerTimingRule === 'afterFirstGuess' && (
                <p className="game-setting-hint">
                  The round has no visible countdown until someone submits. Once the first guess is in, the other player gets a short countdown.
                </p>
              )}
            </div>
          </div>
        </div>

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
  );
}

export default DifficultySelect;
