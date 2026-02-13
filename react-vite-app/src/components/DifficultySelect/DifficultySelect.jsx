import { useState } from 'react';
import './DifficultySelect.css';

const DIFFICULTIES = [
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

function DifficultySelect({ onStart, onBack, isLoading }) {
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [multiplayerHovered, setMultiplayerHovered] = useState(false);

  const handleStart = () => {
    if (selectedDifficulty) {
      onStart(selectedDifficulty, 'singleplayer');
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
          {DIFFICULTIES.map((diff) => (
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
            className="mode-card mode-singleplayer selected"
            disabled
          >
            <span className="mode-card-icon">👤</span>
            <span className="mode-card-label">Singleplayer</span>
          </button>

          <div
            className="mode-card-wrapper"
            onMouseEnter={() => setMultiplayerHovered(true)}
            onMouseLeave={() => setMultiplayerHovered(false)}
          >
            <button
              className="mode-card mode-multiplayer disabled"
              disabled
            >
              <span className="mode-card-icon">👥</span>
              <span className="mode-card-label">Multiplayer</span>
            </button>
            {multiplayerHovered && (
              <span className="coming-soon-tooltip">Coming Soon!</span>
            )}
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
