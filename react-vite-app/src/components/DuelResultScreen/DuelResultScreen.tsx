import { useRef, useEffect, useState, useCallback } from 'react';
import useMapZoom from '../../hooks/useMapZoom';
import { STARTING_HEALTH } from '../../services/duelService';
import LeaveConfirmModal from '../LeaveConfirmModal/LeaveConfirmModal';
import './DuelResultScreen.css';

interface MapPosition {
  x: number;
  y: number;
}

interface RoundGuessData {
  location?: MapPosition | null;
  score?: number;
  distance?: number | null;
  noGuess?: boolean;
}

interface DuelPlayer {
  uid: string;
  username: string;
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
  players: DuelPlayer[];
  roundGuessesByUid: Record<string, RoundGuessData>;
  healthAfter: Record<string, number>;
  healthBefore?: Record<string, number>;
  damage: number;
  multiplier: number;
  damagedPlayer: string | null;
  myUid: string;
  isHost: boolean;
  onNextRound: () => void;
  onViewFinalResults: () => void;
  onLeaveDuel?: () => void;
  isGameOver?: boolean;
}

const PLAYER_COLORS: string[] = [
  '#ff4757', '#3498db', '#9b59b6', '#f39c12', '#2ecc71',
  '#e74c3c', '#1abc9c', '#e056fd', '#686de0', '#95afc0'
];

function colorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function DuelResultScreen({
  roundNumber,
  imageUrl,
  actualLocation,
  players,
  roundGuessesByUid,
  healthAfter,
  healthBefore = {},
  damage,
  multiplier,
  damagedPlayer,
  myUid,
  isHost,
  onNextRound,
  onViewFinalResults,
  onLeaveDuel,
  isGameOver = false
}: DuelResultScreenProps): React.ReactElement {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const mapOuterRef = useRef<HTMLDivElement>(null);
  const [animationPhase, setAnimationPhase] = useState<number>(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const sortedByScore = [...players]
    .map(p => ({ ...p, score: roundGuessesByUid[p.uid]?.score ?? 0 }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.username.localeCompare(b.username);
    });
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

  const damageTargetName = damagedPlayer
    ? (players.find(p => p.uid === damagedPlayer)?.username || 'A player')
    : null;

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
                  {players.map((p) => {
                    const loc = roundGuessesByUid[p.uid]?.location ?? null;
                    if (!loc) return null;
                    const color = colorForUid(p.uid);
                    return (
                      <line
                        key={p.uid}
                        className="duel-result-line"
                        x1={`${loc.x}%`} y1={`${loc.y}%`}
                        x2={`${actualLocation.x}%`} y2={`${actualLocation.y}%`}
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray="6,4"
                      />
                    );
                  })}
                </svg>
              )}

              {/* Player guess markers */}
              {players.map((p) => {
                const loc = roundGuessesByUid[p.uid]?.location ?? null;
                if (!loc) return null;
                const color = colorForUid(p.uid);
                return (
                  <div
                    key={p.uid}
                    className="result-marker"
                    style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
                  >
                    <div
                      className="marker-pin"
                      style={{
                        background: `linear-gradient(135deg, ${color} 0%, ${hexToRgba(color, 0.85)} 100%)`,
                        boxShadow: `0 4px 12px ${hexToRgba(color, 0.45)}`
                      }}
                    />
                    <div className="marker-label">{p.username}{p.uid === myUid ? ' (You)' : ''}</div>
                  </div>
                );
              })}

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

          {/* Round leaderboard */}
          <div className={`duel-score-comparison duel-scoreboard ${animationPhase >= 3 ? 'visible' : ''}`}>
            <div className="duel-scoreboard-title">Round Scores</div>
            <div className="duel-scoreboard-list">
              {sortedByScore.map((p, idx) => {
                const g = roundGuessesByUid[p.uid] || {};
                return (
                  <div key={p.uid} className={`duel-scoreboard-row ${p.uid === myUid ? 'me' : ''}`}>
                    <span className="duel-scoreboard-rank">#{idx + 1}</span>
                    <span className="duel-scoreboard-name">
                      <span className="duel-scoreboard-dot" style={{ backgroundColor: colorForUid(p.uid) }} />
                      {p.username}{p.uid === myUid ? ' (You)' : ''}
                    </span>
                    <span className="duel-scoreboard-score">{(g.score ?? 0).toLocaleString()}</span>
                    <span className="duel-scoreboard-sub">
                      {g.noGuess ? 'No guess' : formatDistance(g.distance)}
                    </span>
                  </div>
                );
              })}
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
                  {damageTargetName ? `${damageTargetName} takes damage` : 'Damage dealt'}
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
            {players.map((p) => {
              const after = healthAfter?.[p.uid] ?? STARTING_HEALTH;
              const before = healthBefore?.[p.uid] ?? after;
              const pctAfter = Math.max(0, (after / STARTING_HEALTH) * 100);
              const pctBefore = Math.max(0, (before / STARTING_HEALTH) * 100);
              const color = colorForUid(p.uid);
              return (
                <div key={p.uid} className="duel-result-health-row">
                  <span className="duel-rh-name">{p.username}{p.uid === myUid ? ' (You)' : ''}</span>
                  <div className="duel-rh-bar">
                    <div
                      className={`duel-rh-fill ${animationPhase >= 4 ? 'animated' : ''}`}
                      style={{
                        width: `${animationPhase >= 4 ? pctAfter : pctBefore}%`,
                        background: `linear-gradient(90deg, ${hexToRgba(color, 0.85)} 0%, ${color} 100%)`,
                        boxShadow: `0 0 6px ${hexToRgba(color, 0.25)}`
                      }}
                    />
                  </div>
                  <span className="duel-rh-value">{(animationPhase >= 4 ? after : before).toLocaleString()}</span>
                </div>
              );
            })}
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
