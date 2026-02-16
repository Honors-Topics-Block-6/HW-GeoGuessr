import { useEffect, useCallback, useRef } from 'react';
import ImageViewer from '../ImageViewer/ImageViewer';
import MapPicker from '../MapPicker/MapPicker';
import type { MapPickerHandle, PlayingArea } from '../MapPicker/MapPicker';
import FloorSelector from '../FloorSelector/FloorSelector';
import GuessButton from '../GuessButton/GuessButton';
import { STARTING_HEALTH } from '../../services/duelService';
import './DuelGameScreen.css';

interface MapPosition {
  x: number;
  y: number;
}

export interface DuelGameScreenProps {
  imageUrl: string;
  guessLocation: MapPosition | null;
  guessFloor: number | null;
  availableFloors: number[] | null;
  onMapClick: (position: MapPosition) => void;
  onFloorSelect: (floor: number) => void;
  onSubmitGuess: () => void;
  onBackToTitle: () => void;
  currentRound: number;
  clickRejected?: boolean;
  playingArea?: PlayingArea | null;
  timeRemaining: number;
  timeLimitSeconds?: number;
  hasSubmitted?: boolean;
  opponentHasSubmitted?: boolean;
  opponentUsername?: string;
  myHealth: number;
  opponentHealth: number;
  myUsername?: string;
}

function DuelGameScreen({
  imageUrl,
  guessLocation,
  guessFloor,
  availableFloors,
  onMapClick,
  onFloorSelect,
  onSubmitGuess,
  onBackToTitle,
  currentRound,
  clickRejected = false,
  playingArea = null,
  timeRemaining,
  timeLimitSeconds = 20,
  hasSubmitted = false,
  opponentHasSubmitted = false,
  opponentUsername = 'Opponent',
  myHealth,
  opponentHealth,
  myUsername = 'You'
}: DuelGameScreenProps): React.ReactElement {
  const mapPickerRef = useRef<MapPickerHandle>(null);

  const isInRegion = availableFloors !== null && availableFloors.length > 0;
  const canSubmit = !hasSubmitted && guessLocation !== null && (!isInRegion || guessFloor !== null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (hasSubmitted) return;

    // Spacebar: submit guess if ready, otherwise click at cursor position on map
    if (e.code === 'Space') {
      e.preventDefault();
      if (canSubmit) {
        onSubmitGuess();
      } else if (!guessLocation && mapPickerRef.current) {
        mapPickerRef.current.clickAtCursor();
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
  }, [hasSubmitted, canSubmit, onSubmitGuess, guessLocation, isInRegion, availableFloors, onFloorSelect]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const myHealthPct = Math.max(0, (myHealth / STARTING_HEALTH) * 100);
  const opponentHealthPct = Math.max(0, (opponentHealth / STARTING_HEALTH) * 100);

  return (
    <div className="duel-game-screen">
      {/* Health Bars at Top */}
      <div className="duel-health-bar-container">
        <div className="duel-health-player duel-health-left">
          <span className="duel-health-name">{myUsername} (You)</span>
          <div className="duel-health-bar">
            <div
              className={`duel-health-fill duel-health-fill-green ${myHealthPct <= 25 ? 'critical' : ''}`}
              style={{ width: `${myHealthPct}%` }}
            />
          </div>
          <span className="duel-health-value">{myHealth.toLocaleString()}</span>
        </div>

        <div className="duel-round-badge-center">
          <span className="duel-round-label">Round</span>
          <span className="duel-round-number">{currentRound}</span>
        </div>

        <div className="duel-health-player duel-health-right">
          <span className="duel-health-name">{opponentUsername}</span>
          <div className="duel-health-bar">
            <div
              className={`duel-health-fill duel-health-fill-red ${opponentHealthPct <= 25 ? 'critical' : ''}`}
              style={{ width: `${opponentHealthPct}%` }}
            />
          </div>
          <span className="duel-health-value">{opponentHealth.toLocaleString()}</span>
        </div>
      </div>

      {/* Main Game Layout */}
      <div className="duel-game-main">
        {/* Left panel - Image */}
        <div className="image-panel">
          <ImageViewer imageUrl={imageUrl} />
        </div>

        {/* Right panel - Guess controls */}
        <div className="guess-panel">
          <div className="guess-panel-header">
            <button className="back-button" onClick={onBackToTitle}>
              <span>&larr;</span>
              <span>Quit</span>
            </button>
            <h2 className="panel-title">Make Your Guess</h2>
          </div>

          {typeof timeRemaining === 'number' && (
            <div className="round-timer">
              <div className="round-timer-top">
                <span className="timer-label">
                  Time left ({timeLimitSeconds}s)
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

          {/* Waiting overlay */}
          {hasSubmitted && (
            <div className="duel-waiting-overlay">
              <div className="duel-waiting-content">
                <div className="duel-waiting-icon">
                  {opponentHasSubmitted ? '✓' : '⏳'}
                </div>
                <p className="duel-waiting-text">
                  {opponentHasSubmitted
                    ? 'Both guesses in! Processing...'
                    : 'Waiting for opponent...'}
                </p>
                <div className="duel-waiting-dots">
                  <span className="duel-dot"></span>
                  <span className="duel-dot"></span>
                  <span className="duel-dot"></span>
                </div>
                {opponentHasSubmitted && (
                  <p className="duel-waiting-sub">{opponentUsername} has guessed</p>
                )}
              </div>
            </div>
          )}

          {!hasSubmitted && (
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
          )}

          {/* Guess Status */}
          {!hasSubmitted && (
            <div className="guess-status">
              <div className={`status-item ${guessLocation ? 'complete' : ''}`}>
                <span className="status-icon">{guessLocation ? '\u2713' : '\u25CB'}</span>
                <span>Location selected</span>
              </div>
              {isInRegion && (
                <div className={`status-item ${guessFloor ? 'complete' : ''}`}>
                  <span className="status-icon">{guessFloor ? '\u2713' : '\u25CB'}</span>
                  <span>Floor selected</span>
                </div>
              )}
            </div>
          )}

          {/* Opponent status indicator */}
          {!hasSubmitted && opponentHasSubmitted && (
            <div className="duel-opponent-guessed">
              {opponentUsername} has made their guess!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DuelGameScreen;
