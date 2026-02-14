import { useEffect, useCallback, useRef } from 'react';
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
  playingArea = null,
  timeRemaining,
  timeLimitSeconds = 20
}) {
  const mapPickerRef = useRef(null);

  // Can submit if location is selected AND either:
  // - not in a region (availableFloors is null), OR
  // - in a region with floors and a floor is selected
  const isInRegion = availableFloors !== null && availableFloors.length > 0;
  const canSubmit = guessLocation !== null && (!isInRegion || guessFloor !== null);

  const handleKeyDown = useCallback((e) => {
    // Spacebar: submit guess if ready, otherwise place marker at map center
    if (e.code === 'Space') {
      e.preventDefault();
      if (canSubmit) {
        onSubmitGuess();
      } else if (!guessLocation && mapPickerRef.current) {
        const center = mapPickerRef.current.getViewportCenter();
        onMapClick(center);
      }
      return;
    }

    // Number keys (1-9): select floor when floor selector is visible
    if (isInRegion && availableFloors) {
      const digit = parseInt(e.key, 10);
      if (!isNaN(digit) && digit >= 1 && availableFloors.includes(digit)) {
        e.preventDefault();
        onFloorSelect(digit);
      }
    }
  }, [canSubmit, onSubmitGuess, guessLocation, onMapClick, isInRegion, availableFloors, onFloorSelect]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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

        {typeof timeRemaining === 'number' && (
          <div className="round-timer">
            <div className="round-timer-top">
              <span className="timer-label">
                Time left ({timeLimitSeconds.toFixed ? timeLimitSeconds.toFixed(0) : timeLimitSeconds}s)
              </span>
              <span
                className={
                  `timer-value${
                    timeRemaining <= 5
                      ? ' critical'
                      : timeRemaining <= 10
                        ? ' warning'
                        : ''
                  }`
                }
              >
                {timeRemaining.toFixed(2)}s
              </span>
            </div>
            <div className="timer-bar">
              <div
                className={
                  `timer-bar-fill${
                    timeRemaining <= 5
                      ? ' critical'
                      : timeRemaining <= 10
                        ? ' warning'
                        : ''
                  }`
                }
                style={{
                  width: `${Math.max(0, Math.min(1, timeRemaining / timeLimitSeconds)) * 100}%`
                }}
              />
            </div>
          </div>
        )}

        <div className="guess-controls">
          <MapPicker
            ref={mapPickerRef}
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
