import ImageViewer from '../ImageViewer/ImageViewer';
import MapPicker from '../MapPicker/MapPicker';
import FloorSelector from '../FloorSelector/FloorSelector';
import GuessButton from '../GuessButton/GuessButton';
import './GameScreen.css';

function GameScreen({
  imageUrl,
  guessLocation,
  guessFloor,
  onMapClick,
  onFloorSelect,
  onSubmitGuess,
  onBackToTitle
}) {
  const canSubmit = guessLocation !== null && guessFloor !== null;

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
        </div>

        <div className="guess-controls">
          <MapPicker
            markerPosition={guessLocation}
            onMapClick={onMapClick}
          />

          <FloorSelector
            selectedFloor={guessFloor}
            onFloorSelect={onFloorSelect}
          />

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
          <div className={`status-item ${guessFloor ? 'complete' : ''}`}>
            <span className="status-icon">{guessFloor ? '✓' : '○'}</span>
            <span>Floor selected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameScreen;
