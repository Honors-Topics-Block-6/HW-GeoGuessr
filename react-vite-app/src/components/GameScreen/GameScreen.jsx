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
      <header className="game-hud ui-surface">
        <div className="hud-left">
          <button className="back-button ui-chip" onClick={onBackToTitle}>
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>
          <span className="ui-chip">Classic</span>
        </div>
        <div className="hud-right">
          <div className="round-badge ui-chip primary">
            {currentRound} / {totalRounds}
          </div>
        </div>
      </header>

      <div className="game-layout">
      {/* Left panel - Image */}
      <div className="image-panel">
        <ImageViewer imageUrl={imageUrl} />
      </div>

      {/* Right panel - Guess controls */}
      <div className="guess-panel">
        <div className="guess-panel-header">
          <h2 className="panel-title">Make Your Guess</h2>
          <p className="panel-subtitle">Place your pin, then lock it in.</p>
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
        </div>

        {/* Guess Status */}
        <div className="guess-status" aria-label="Progress">
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

        <div className="guess-actions">
          <GuessButton
            disabled={!canSubmit}
            onClick={onSubmitGuess}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

export default GameScreen;
