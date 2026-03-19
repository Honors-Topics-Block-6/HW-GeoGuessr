import { useEffect, useCallback, useRef, useState } from 'react';
import ImageViewer from '../ImageViewer/ImageViewer';
import LeaveConfirmModal from '../LeaveConfirmModal/LeaveConfirmModal';
import MapPicker from '../MapPicker/MapPicker';
import type { MapPickerHandle, PlayingArea } from '../MapPicker/MapPicker';
import FloorSelector from '../FloorSelector/FloorSelector';
import GuessButton from '../GuessButton/GuessButton';
import { STARTING_HEALTH } from '../../services/duelService';
import './DuelGameScreen.css';

const QUICK_EMOTES = ['🔥', '😅', '😎', '🤯', '👏'];

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
  timeRemaining?: number;
  timeLimitSeconds?: number;
  hasSubmitted?: boolean;
  opponentHasSubmitted?: boolean; // legacy 1v1
  opponentUsername?: string; // legacy 1v1
  myHealth: number;
  opponentHealth?: number; // legacy 1v1
  myUsername?: string;
  myActiveEmote?: string | null;
  opponentActiveEmote?: string | null;
  onSendEmote?: (emoji: string) => Promise<void>;
  activeGuessesCount?: number;
  activePlayerCount?: number;
  totalPlayerCount?: number;
  allActiveGuessed?: boolean;
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
  opponentHealth = STARTING_HEALTH,
  myUsername = 'You',
  myActiveEmote = null,
  opponentActiveEmote = null,
  onSendEmote,
  activeGuessesCount = 0,
  activePlayerCount = 2,
  totalPlayerCount = 2,
  allActiveGuessed = false
}: DuelGameScreenProps): React.ReactElement {
  const mapPickerRef = useRef<MapPickerHandle>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

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
  const isTwoPlayer = totalPlayerCount === 2;

  // Mobile: show floor selector when location is placed and we're in a region with floors
  const showMobileFloorOverlay = guessLocation !== null && isInRegion;
  // Mobile: show guess button when ready to submit
  const showMobileGuessOverlay = canSubmit;

  return (
    <div className="duel-game-screen">
      {/* ===== DESKTOP LAYOUT ===== */}
      {/* Health Bars at Top */}
      <div className="duel-health-bar-container desktop-only">
        <div className="duel-health-player duel-health-left">
          <span className="duel-health-name">
            {myUsername} (You)
            {myActiveEmote && (
              <span className="duel-active-emote duel-active-emote-self" aria-label="Your emote">
                {myActiveEmote}
              </span>
            )}
          </span>
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

        {isTwoPlayer ? (
          <div className="duel-health-player duel-health-right">
            <span className="duel-health-name">
              {opponentUsername}
              {opponentActiveEmote && (
                <span className="duel-active-emote duel-active-emote-opponent" aria-label={`${opponentUsername} emote`}>
                  {opponentActiveEmote}
                </span>
              )}
            </span>
            <div className="duel-health-bar">
              <div
                className={`duel-health-fill duel-health-fill-red ${opponentHealthPct <= 25 ? 'critical' : ''}`}
                style={{ width: `${opponentHealthPct}%` }}
              />
            </div>
            <span className="duel-health-value">{opponentHealth.toLocaleString()}</span>
          </div>
        ) : (
          <div className="duel-top-right">
            <span className="duel-top-pill">👥 {activePlayerCount}/{totalPlayerCount} Alive</span>
            <span className="duel-top-pill">✅ {activeGuessesCount}/{Math.max(1, activePlayerCount)} Guessed</span>
          </div>
        )}
      </div>

      {/* Main Game Layout */}
      <div className="duel-game-main desktop-only">
        {/* Left panel - Image */}
        <div className="image-panel">
          <ImageViewer imageUrl={imageUrl} />
        </div>

        {/* Right panel - Guess controls */}
        <div className="guess-panel">
          <div className="guess-panel-header">
            <button className="back-button" onClick={() => setShowLeaveConfirm(true)}>
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
                    `timer-value${timeRemaining <= 5
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
                    `timer-bar-fill${timeRemaining <= 5
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

          {onSendEmote && (
            <div className="duel-emote-bar" aria-label="Quick emotes">
              {QUICK_EMOTES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="duel-emote-button"
                  onClick={() => { void onSendEmote(emoji); }}
                  aria-label={`Send emote ${emoji}`}
                  title={`Send ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Waiting overlay */}
          {hasSubmitted && (
            <div className="duel-waiting-overlay">
              <div className="duel-waiting-content">
                <div className="duel-waiting-icon">
                  {allActiveGuessed ? '✓' : '⏳'}
                </div>
                <p className="duel-waiting-text">
                  {allActiveGuessed
                    ? 'All guesses in! Processing...'
                    : `Waiting for other players... (${activeGuessesCount}/${Math.max(1, activePlayerCount)})`}
                </p>
                <div className="duel-waiting-dots">
                  <span className="duel-dot"></span>
                  <span className="duel-dot"></span>
                  <span className="duel-dot"></span>
                </div>
                {!allActiveGuessed && activeGuessesCount > 0 && (
                  <p className="duel-waiting-sub">{activeGuessesCount} player{activeGuessesCount !== 1 ? 's' : ''} guessed</p>
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
          {!hasSubmitted && (isTwoPlayer ? opponentHasSubmitted : activeGuessesCount > 0) && (
            <div className="duel-opponent-guessed">
              {isTwoPlayer ? `${opponentUsername} has made their guess!` : `${activeGuessesCount} player${activeGuessesCount !== 1 ? 's have' : ' has'} guessed!`}
            </div>
          )}
        </div>
      </div>

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="duel-mobile-layout mobile-only">
        {/* Mobile Timer */}
        {typeof timeRemaining === 'number' && (
          <div className="mobile-timer">
            <div className="mobile-timer-bar">
              <div
                className={`mobile-timer-fill${timeRemaining <= 5 ? ' critical' : timeRemaining <= 10 ? ' warning' : ''
                  }`}
                style={{
                  width: `${Math.max(0, Math.min(1, timeRemaining / timeLimitSeconds)) * 100}%`
                }}
              />
            </div>
            <span className={`mobile-timer-value${timeRemaining <= 5 ? ' critical' : timeRemaining <= 10 ? ' warning' : ''
              }`}>
              {timeRemaining.toFixed(1)}s
            </span>
          </div>
        )}

        {/* Mobile Health Bars */}
        <div className="duel-mobile-health">
          <div className="duel-mobile-health-player">
            <span className="duel-mobile-health-name">{myUsername}</span>
            <div className="duel-mobile-health-bar">
              <div
                className={`duel-mobile-health-fill green ${myHealthPct <= 25 ? 'critical' : ''}`}
                style={{ width: `${myHealthPct}%` }}
              />
            </div>
            <span className="duel-mobile-health-value">{myHealth.toLocaleString()}</span>
          </div>
          <div className="duel-mobile-round">R{currentRound}</div>
          <div className="duel-mobile-health-player">
            <span className="duel-mobile-health-name">{opponentUsername}</span>
            <div className="duel-mobile-health-bar">
              <div
                className={`duel-mobile-health-fill red ${opponentHealthPct <= 25 ? 'critical' : ''}`}
                style={{ width: `${opponentHealthPct}%` }}
              />
            </div>
            <span className="duel-mobile-health-value">{opponentHealth.toLocaleString()}</span>
          </div>
        </div>

        {!isTwoPlayer && (
          <div className="duel-mobile-top-stats">
            <span className="duel-mobile-top-pill">👥 {activePlayerCount}/{totalPlayerCount} Alive</span>
            <span className="duel-mobile-top-pill">✅ {activeGuessesCount}/{Math.max(1, activePlayerCount)} Guessed</span>
          </div>
        )}

        {!hasSubmitted && (isTwoPlayer ? opponentHasSubmitted : activeGuessesCount > 0) && (
          <div className="duel-mobile-opponent-guessed">
            {isTwoPlayer ? `${opponentUsername} has made their guess!` : `${activeGuessesCount} player${activeGuessesCount !== 1 ? 's have' : ' has'} guessed!`}
          </div>
        )}

        {/* Mobile Image */}
        <div className="duel-mobile-image-container">
          <ImageViewer imageUrl={imageUrl} />
          <button className="mobile-leave-button" onClick={() => setShowLeaveConfirm(true)}>
            Leave Duel
          </button>
        </div>

        {/* Mobile Map */}
        <div className="duel-mobile-map-container">
          {hasSubmitted ? (
            <div className="duel-mobile-waiting">
              <div className="duel-mobile-waiting-icon">
                {opponentHasSubmitted ? '✓' : '⏳'}
              </div>
              <p className="duel-mobile-waiting-text">
                {opponentHasSubmitted ? 'Processing...' : 'Waiting for opponent...'}
              </p>
            </div>
          ) : (
            <>
              <MapPicker
                markerPosition={guessLocation}
                onMapClick={onMapClick}
                clickRejected={clickRejected}
                playingArea={playingArea}
              />

              {/* Mobile Emote Overlay */}
              {onSendEmote && (
                <div className="duel-mobile-emote-overlay" aria-label="Quick emotes">
                  {QUICK_EMOTES.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="duel-mobile-emote-button"
                      onClick={() => { void onSendEmote(emoji); }}
                      aria-label={`Send emote ${emoji}`}
                      title={`Send ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Mobile Floor Selector Overlay */}
              {showMobileFloorOverlay && (
                <div className="mobile-floor-overlay">
                  <div className="mobile-floor-content">
                    <span className="mobile-floor-label">Select Floor</span>
                    <div className="mobile-floor-buttons">
                      {availableFloors!.map((floor: number) => (
                        <button
                          key={floor}
                          type="button"
                          className={`mobile-floor-btn ${guessFloor === floor ? 'selected' : ''}`}
                          onClick={() => onFloorSelect(floor)}
                        >
                          {floor}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Guess Button Overlay */}
              {showMobileGuessOverlay && (
                <div className="mobile-guess-overlay">
                  <button className="mobile-guess-btn" onClick={onSubmitGuess}>
                    <span>🎯</span>
                    <span>Guess</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showLeaveConfirm && (
        <LeaveConfirmModal
          onConfirm={() => {
            setShowLeaveConfirm(false);
            onBackToTitle();
          }}
          onCancel={() => setShowLeaveConfirm(false)}
          isDuel={true}
        />
      )}
    </div>
  );
}

export default DuelGameScreen;
