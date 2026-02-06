import ImageViewer from '../ImageViewer/ImageViewer';
import MapPicker from '../MapPicker/MapPicker';
import FloorSelector from '../FloorSelector/FloorSelector';
import GuessButton from '../GuessButton/GuessButton';
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
  playingArea = null
}) {
  // Can submit if location is selected AND either:
  // - not in a region (availableFloors is null), OR
  // - in a region with floors and a floor is selected
  const isInRegion = availableFloors !== null && availableFloors.length > 0;
  const canSubmit = guessLocation !== null && (!isInRegion || guessFloor !== null);

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

          {isInRegion && (
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
          {isInRegion && (
            <div className={`status-item ${guessFloor ? 'complete' : ''}`}>
              <span className="status-icon">{guessFloor ? '✓' : '○'}</span>
              <span>Floor selected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameScreen;
