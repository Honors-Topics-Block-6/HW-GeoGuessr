import ImageViewer from '../ImageViewer/ImageViewer';
import MapPicker from '../MapPicker/MapPicker';
import FloorSelector from '../FloorSelector/FloorSelector';
import GuessButton from '../GuessButton/GuessButton';
import DailyGoalsCard from '../DailyGoalsCard/DailyGoalsCard';
import './GameScreen.css';

function GameScreen({
  imageUrl,
  guessLocation,
  guessFloor,
  availableFloors,
  onMapClick,
  onFloorSelect,
  onSubmitGuess,
  onBackToTitle,
  currentRound = 1,
  totalRounds = 5,
  clickRejected = false,
  playingArea = null,
  dailyGoals = null
}) {
  // Can submit if location is selected AND either:
  // - not in a region (availableFloors is null), OR
  // - in a region with floors and a floor is selected
  const hasFloorRequirement = Array.isArray(availableFloors) && availableFloors.length > 0;
  const canSubmit = guessLocation !== null && (!hasFloorRequirement || guessFloor !== null);

  return (
    <div className="game-screen">
      {/* Left panel - Image */}
      <div className="image-panel">
        <ImageViewer imageUrl={imageUrl} />
      </div>

      {/* Right panel - Guess controls */}
      <div className="guess-panel">
        <div className="guess-panel-header">
          <button className="back-button" onClick={onBackToTitle}>
            <span>←</span>
            <span>Back</span>
          </button>
          <h2 className="panel-title">Make Your Guess</h2>
          <div className="round-badge">
            {currentRound} / {totalRounds}
          </div>
        </div>

        <div className="guess-controls">
          <MapPicker
            markerPosition={guessLocation}
            onMapClick={onMapClick}
            clickRejected={clickRejected}
            playingArea={playingArea}
          />

          {hasFloorRequirement && (
            <FloorSelector
              selectedFloor={guessFloor}
              onFloorSelect={onFloorSelect}
              floors={availableFloors}
            />
          )}

          <GuessButton
            disabled={!canSubmit}
            onClick={onSubmitGuess}
          />
        </div>

        {/* Guess Status */}
        <div className="guess-status">
          <div className={`status-item ${guessLocation ? 'complete' : ''}`}>
            <span className="status-icon">{guessLocation ? '✓' : '○'}</span>
            <span>Location selected</span>
          </div>
          {hasFloorRequirement && (
            <div className={`status-item ${guessFloor ? 'complete' : ''}`}>
              <span className="status-icon">{guessFloor ? '✓' : '○'}</span>
              <span>Floor selected</span>
            </div>
          )}
        </div>

        {dailyGoals && (
          <div className="game-daily-goals">
            <DailyGoalsCard variant="compact" {...dailyGoals} />
          </div>
        )}
      </div>
    </div>
  );
}

export default GameScreen;
