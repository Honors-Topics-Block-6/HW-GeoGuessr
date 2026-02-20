import { useRef, useEffect, useState, useCallback } from 'react';
import useMapZoom from '../../hooks/useMapZoom';
import { STARTING_HEALTH } from '../../services/duelService';
import LeaveConfirmModal from '../LeaveConfirmModal/LeaveConfirmModal';
import './DuelResultScreen.css';

interface MapPosition {
  x: number;
  y: number;
}

interface GuessData {
  location?: MapPosition | null;
  score?: number;
  distance?: number | null;
  noGuess?: boolean;
}

/**
 * Format distance as a readable string
 */
function formatDistance(distance: number | null | undefined): string {
  if (distance === null || distance === undefined) return 'No guess';
  const feet = Math.round(distance * 2);
  if (feet <= 10) return 'Perfect!';
  return `${feet} ft away`;
}

export interface DuelResultScreenProps {
  roundNumber: number;
  imageUrl: string;
  actualLocation: MapPosition;
  myGuess: GuessData | null;
  opponentGuess: GuessData | null;
  myUsername: string;
  opponentUsername: string;
  myHealth: number;
  opponentHealth: number;
  myHealthBefore: number;
  opponentHealthBefore: number;
  damage: number;
  multiplier: number;
  damagedPlayer: string | null;
  myUid: string;
  isHost: boolean;
  onNextRound: () => void;
  onViewFinalResults: () => void;
  onLeaveDuel?: () => void;
  isGameOver: boolean;
}

function DuelResultScreen({
  roundNumber,
  imageUrl,
  actualLocation,
  myGuess,
  opponentGuess,
  myUsername,
  opponentUsername,
  myHealth,
  opponentHealth,
  myHealthBefore,
  opponentHealthBefore,
  damage,
  multiplier,
  damagedPlayer,
  myUid,
  isHost,
  onNextRound,
  onViewFinalResults,
  onLeaveDuel,
  isGameOver
}: DuelResultScreenProps): React.ReactElement {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const mapOuterRef = useRef<HTMLDivElement>(null);
  const [animationPhase, setAnimationPhase] = useState<number>(0);
  const [displayedMyScore, setDisplayedMyScore] = useState<number>(0);
  const [displayedOpScore, setDisplayedOpScore] = useState<number>(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const myScore = myGuess?.score ?? 0;
  const opScore = opponentGuess?.score ?? 0;

  const myLocation = myGuess?.location || null;
  const opLocation = opponentGuess?.location || null;

  const iWon = myScore > opScore;
  const iLost = myScore < opScore;
  const isTie = myScore === opScore;
  const iTookDamage = damagedPlayer === myUid;

  // Sync map container height to details panel
  useEffect(() => {
    const detailsEl = detailsRef.current;
    const mapEl = mapOuterRef.current;
    if (!detailsEl || !mapEl) return;

    const syncHeight = (): void => {
      const detailsHeight = detailsEl.offsetHeight;
      if (detailsHeight > 0) {
        mapEl.style.height = `${detailsHeight}px`;
      }
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(detailsEl);
    return () => observer.disconnect();
  }, []);

  const { scale, transformStyle, handlers, zoomIn, zoomOut, resetZoom, isPanning } = useMapZoom(mapContainerRef);
  const isZoomed = scale > 1;

  // Animation sequence
  useEffect(() => {
    const timers = [
      setTimeout(() => setAnimationPhase(1), 300),
      setTimeout(() => setAnimationPhase(2), 700),
      setTimeout(() => setAnimationPhase(3), 1100),
      setTimeout(() => setAnimationPhase(4), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Spacebar to advance
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (isGameOver) {
        onViewFinalResults();
      } else if (isHost) {
        onNextRound();
      }
    }
  }, [isGameOver, isHost, onNextRound, onViewFinalResults]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Animate score counters
  useEffect(() => {
    if (animationPhase >= 3) {
      const duration = 800;
      const steps = 25;
      const myInc = myScore / steps;
      const opInc = opScore / steps;
      let currentMy = 0;
      let currentOp = 0;

      const interval = setInterval(() => {
        currentMy += myInc;
        currentOp += opInc;

        if (currentMy >= myScore) setDisplayedMyScore(myScore);
        else setDisplayedMyScore(Math.round(currentMy));

        if (currentOp >= opScore) setDisplayedOpScore(opScore);
        else setDisplayedOpScore(Math.round(currentOp));

        if (currentMy >= myScore && currentOp >= opScore) {
          clearInterval(interval);
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }
  }, [animationPhase, myScore, opScore]);

  const myHealthPct = Math.max(0, (myHealth / STARTING_HEALTH) * 100);
  const opHealthPct = Math.max(0, (opponentHealth / STARTING_HEALTH) * 100);

  return (
    <div className="duel-result-screen">
      {/* Header */}
      <div className="duel-result-header">
        <div className="duel-result-round">
          Round {roundNumber}
        </div>
        <div className="duel-result-multiplier">
          {multiplier}x Damage
        </div>
      </div>

      {/* Main content */}
      <div className="duel-result-content">
        {/* Map */}
        <div className="duel-result-map-container" ref={mapOuterRef}>
          <div
            className={`duel-result-map ${isZoomed ? 'zoomed' : ''} ${isPanning ? 'is-panning' : ''}`}
            ref={mapContainerRef}
            {...handlers}
          >
            <div className="duel-result-zoom-content" style={{ transform: transformStyle }}>
              <img className="map-image" src="/FINAL_MAP.png" alt="Campus Map" draggable="false" onDragStart={(e: React.DragEvent<HTMLImageElement>) => e.preventDefault()} />

              {/* Lines from guesses to actual */}
              {animationPhase >= 2 && (
                <svg
                  className="duel-result-line-svg"
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: '100%', pointerEvents: 'none'
                  }}
                >
                  {myLocation && (
                    <line
                      className="duel-result-line"
                      x1={`${myLocation.x}%`} y1={`${myLocation.y}%`}
                      x2={`${actualLocation.x}%`} y2={`${actualLocation.y}%`}
                      stroke="#ff6b6b" strokeWidth="2" strokeDasharray="6,4"
                    />
                  )}
                  {opLocation && (
                    <line
                      className="duel-result-line duel-result-line-delayed"
                      x1={`${opLocation.x}%`} y1={`${opLocation.y}%`}
                      x2={`${actualLocation.x}%`} y2={`${actualLocation.y}%`}
                      stroke="#74b9ff" strokeWidth="2" strokeDasharray="6,4"
                    />
                  )}
                </svg>
              )}

              {/* My guess marker (red) */}
              {myLocation && (
                <div
                  className="result-marker duel-my-marker"
                  style={{ left: `${myLocation.x}%`, top: `${myLocation.y}%` }}
                >
                  <div className="marker-pin duel-pin-red"></div>
                  <div className="marker-label">{myUsername}</div>
                </div>
              )}

              {/* Opponent guess marker (blue) - Phase 1+ */}
              {opLocation && animationPhase >= 1 && (
                <div
                  className="result-marker duel-opponent-marker"
                  style={{ left: `${opLocation.x}%`, top: `${opLocation.y}%` }}
                >
                  <div className="marker-pin duel-pin-blue"></div>
                  <div className="marker-label">{opponentUsername}</div>
                </div>
              )}

              {/* Actual location marker (green) - Phase 1+ */}
              {animationPhase >= 1 && (
                <div
                  className="result-marker actual-marker"
                  style={{ left: `${actualLocation.x}%`, top: `${actualLocation.y}%` }}
                >
                  <div className="marker-pin actual-pin"></div>
                  <div className="marker-label">Correct</div>
                </div>
              )}
            </div>

            {/* Zoom controls */}
            <div className="zoom-controls">
              <button className="zoom-btn zoom-in-btn" onClick={(e: React.MouseEvent) => { e.stopPropagation(); zoomIn(); }} title="Zoom in" aria-label="Zoom in">+</button>
              <button className="zoom-btn zoom-out-btn" onClick={(e: React.MouseEvent) => { e.stopPropagation(); zoomOut(); }} title="Zoom out" aria-label="Zoom out" disabled={!isZoomed}>-</button>
              <button className="zoom-btn zoom-reset-btn" onClick={(e: React.MouseEvent) => { e.stopPropagation(); resetZoom(); }} title="Reset zoom" aria-label="Reset zoom" disabled={!isZoomed}>&#x21BA;</button>
            </div>

            {isZoomed && (
              <div className="zoom-indicator">{Math.round(scale * 100)}%</div>
            )}
          </div>
        </div>

        {/* Details panel */}
        <div className="duel-result-details" ref={detailsRef}>
          {/* Image preview */}
          <div className="duel-result-image-preview">
            <img src={imageUrl} alt="Location" />
          </div>

          {/* Score comparison */}
          <div className={`duel-score-comparison ${animationPhase >= 3 ? 'visible' : ''}`}>
            <div className={`duel-score-player ${iWon ? 'winner' : iLost ? 'loser' : ''}`}>
              <span className="duel-score-name">{myUsername}</span>
              <span className="duel-score-value">{displayedMyScore.toLocaleString()}</span>
              <span className="duel-score-sub">
                {myGuess?.noGuess ? 'No guess' : formatDistance(myGuess?.distance)}
              </span>
            </div>

            <div className="duel-score-vs">VS</div>

            <div className={`duel-score-player ${!iWon && !isTie ? 'winner' : !iLost && !isTie ? 'loser' : ''}`}>
              <span className="duel-score-name">{opponentUsername}</span>
              <span className="duel-score-value">{displayedOpScore.toLocaleString()}</span>
              <span className="duel-score-sub">
                {opponentGuess?.noGuess ? 'No guess' : formatDistance(opponentGuess?.distance)}
              </span>
            </div>
          </div>

          {/* Damage display */}
          {animationPhase >= 4 && damage > 0 && (
            <div className="duel-damage-display">
              <div className="duel-damage-icon">
                {iTookDamage ? '💔' : '⚔️'}
              </div>
              <div className="duel-damage-info">
                <span className="duel-damage-value">-{damage.toLocaleString()} HP</span>
                <span className="duel-damage-target">
                  {iTookDamage ? `${myUsername} takes damage` : `${opponentUsername} takes damage`}
                </span>
                {multiplier > 1 && (
                  <span className="duel-damage-mult">{multiplier}x multiplier</span>
                )}
              </div>
            </div>
          )}

          {animationPhase >= 4 && damage === 0 && (
            <div className="duel-damage-display duel-damage-tie">
              <div className="duel-damage-icon">🤝</div>
              <div className="duel-damage-info">
                <span className="duel-damage-value">Tie!</span>
                <span className="duel-damage-target">No damage dealt</span>
              </div>
            </div>
          )}

          {/* Health bars */}
          <div className="duel-result-health">
            <div className="duel-result-health-row">
              <span className="duel-rh-name">{myUsername}</span>
              <div className="duel-rh-bar">
                <div
                  className={`duel-rh-fill duel-rh-fill-green ${animationPhase >= 4 ? 'animated' : ''}`}
                  style={{ width: `${animationPhase >= 4 ? myHealthPct : (myHealthBefore / STARTING_HEALTH) * 100}%` }}
                />
              </div>
              <span className="duel-rh-value">{animationPhase >= 4 ? myHealth.toLocaleString() : myHealthBefore.toLocaleString()}</span>
            </div>
            <div className="duel-result-health-row">
              <span className="duel-rh-name">{opponentUsername}</span>
              <div className="duel-rh-bar">
                <div
                  className={`duel-rh-fill duel-rh-fill-red ${animationPhase >= 4 ? 'animated' : ''}`}
                  style={{ width: `${animationPhase >= 4 ? opHealthPct : (opponentHealthBefore / STARTING_HEALTH) * 100}%` }}
                />
              </div>
              <span className="duel-rh-value">{animationPhase >= 4 ? opponentHealth.toLocaleString() : opponentHealthBefore.toLocaleString()}</span>
            </div>
          </div>

          {/* KO indicator */}
          {isGameOver && animationPhase >= 4 && (
            <div className="duel-ko-banner">
              <span className="duel-ko-text">K.O.!</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="duel-result-actions">
            {isGameOver ? (
              <button className="duel-result-action-btn" onClick={onViewFinalResults}>
                View Final Results
                <span className="button-arrow">&rarr;</span>
              </button>
            ) : isHost ? (
              <button className="duel-result-action-btn" onClick={onNextRound}>
                Next Round
                <span className="button-arrow">&rarr;</span>
              </button>
            ) : (
              <div className="duel-result-waiting-host">
                <span>Waiting for host to start next round</span>
                <div className="duel-waiting-dots">
                  <span className="duel-dot"></span>
                  <span className="duel-dot"></span>
                  <span className="duel-dot"></span>
                </div>
              </div>
            )}
            {onLeaveDuel && (
              <button className="leave-duel-button" onClick={() => setShowLeaveConfirm(true)}>
                <span className="button-icon">&larr;</span>
                Leave Duel
              </button>
            )}
          </div>
        </div>
      </div>

      {showLeaveConfirm && onLeaveDuel && (
        <LeaveConfirmModal
          onConfirm={() => {
            setShowLeaveConfirm(false);
            onLeaveDuel();
          }}
          onCancel={() => setShowLeaveConfirm(false)}
          isDuel={true}
        />
      )}
    </div>
  );
}

export default DuelResultScreen;
