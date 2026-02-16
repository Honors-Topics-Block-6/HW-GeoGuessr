import { useState } from 'react';
import './DifficultySelect.css';

type DifficultyId = 'all' | 'easy' | 'medium' | 'hard';
type GameMode = 'singleplayer' | 'multiplayer';

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
  onStart: (difficulty: DifficultyId, mode: GameMode) => void;
  onBack: () => void;
  isLoading: boolean;
}

function DifficultySelect({ onStart, onBack, isLoading }: DifficultySelectProps): React.ReactElement {
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameMode>('singleplayer');

  const handleStart = (): void => {
    if (selectedDifficulty) {
      onStart(selectedDifficulty, selectedMode);
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
