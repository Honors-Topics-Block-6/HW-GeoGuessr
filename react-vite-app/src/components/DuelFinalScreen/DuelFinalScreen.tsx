import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { STARTING_HEALTH } from '../../services/duelService';
import { useDailyGoals } from '../../hooks/useDailyGoals';
import { GOAL_TYPES } from '../../utils/dailyGoalDefinitions';
import './DuelFinalScreen.css';

const CONFETTI_COLORS: string[] = ['#6cb52d', '#ffc107', '#ff4757', '#3498db', '#9b59b6', '#e74c3c'];

interface ConfettiPiece {
  id: number;
  left: string;
  delay: string;
  color: string;
}

function generateConfettiData(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
  }));
}

interface DuelPlayer {
  uid: string;
  username: string;
}

interface RoundPlayerData {
  score?: number;
  [key: string]: unknown;
}

interface RoundHistory {
  roundNumber: number;
  multiplier: number;
  damage: number;
  damagedPlayer: string | null;
  players?: Record<string, RoundPlayerData>;
  healthAfter?: Record<string, number>;
}

export interface DuelFinalScreenProps {
  winner: string;
  loser: string;
  myUid: string;
  players: DuelPlayer[];
  roundHistory: RoundHistory[];
  health: Record<string, number>;
  forfeitBy?: string | null;
  onPlayAgain: () => void;
  onBackToTitle: () => void;
}

function DuelFinalScreen({
  winner,
  loser,
  myUid,
  players,
  roundHistory,
  health,
  forfeitBy = null,
  onPlayAgain,
  onBackToTitle
}: DuelFinalScreenProps): React.ReactElement {
  const [animationComplete, setAnimationComplete] = useState<boolean>(false);
  const { recordProgress } = useDailyGoals(myUid);
  const goalsRecorded = useRef<boolean>(false);

  const confettiPieces = useMemo(() => generateConfettiData(40), []);

  const isWinner = winner === myUid;
  const winnerPlayer = players.find((p: DuelPlayer) => p.uid === winner);
  const winnerUsername = winnerPlayer?.username || 'Winner';
  const loserUsername = players.find((p: DuelPlayer) => p.uid === loser)?.username || 'Loser';

  // Calculate total scores per player
  const totalRounds = roundHistory.length;
  const totalScoreByUid: Record<string, number> = {};
  for (const p of players) totalScoreByUid[p.uid] = 0;
  for (const r of roundHistory) {
    const map = r.players || {};
    for (const [uid, pdata] of Object.entries(map)) {
      totalScoreByUid[uid] = (totalScoreByUid[uid] || 0) + ((pdata.score as number) || 0);
    }
  }

  const standings = [...players]
    .map((p) => ({
      uid: p.uid,
      username: p.username,
      totalScore: totalScoreByUid[p.uid] || 0,
      finalHealth: health?.[p.uid] ?? 0
    }))
    .sort((a, b) => {
      if (a.uid === winner) return -1;
      if (b.uid === winner) return 1;
      if (b.finalHealth !== a.finalHealth) return b.finalHealth - a.finalHealth;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.username.localeCompare(b.username);
    });

  // Spacebar to play again
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onPlayAgain();
    }
  }, [onPlayAgain]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Trigger animations
  useEffect(() => {
    const timer = setTimeout(() => setAnimationComplete(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Record daily goal progress for duel completion (await so doc is created once, then all updates apply)
  useEffect(() => {
    if (goalsRecorded.current || !myUid) return;
    goalsRecorded.current = true;

    (async () => {
      await recordProgress(GOAL_TYPES.PLAY_DUEL, 1);
      if (winner === myUid) {
        await recordProgress(GOAL_TYPES.WIN_DUEL, 1);
      }
      await recordProgress(GOAL_TYPES.GAMES_PLAYED, 1);
    })().catch((err: Error) => console.error('Failed to record daily goal progress:', err));
  }, [myUid, winner, recordProgress]);

  return (
    <div className="duel-final-screen">
      <div className="duel-final-background">
        <div className="duel-final-confetti-container">
          {animationComplete && isWinner && confettiPieces.map((piece: ConfettiPiece) => (
            <div
              key={piece.id}
              className="confetti"
              style={{
                left: piece.left,
                animationDelay: piece.delay,
                backgroundColor: piece.color
              }}
            />
          ))}
        </div>
      </div>

      <div className="duel-final-content">
        {/* Hero */}
        <div className="duel-final-hero">
          <div className={`duel-final-badge ${isWinner ? 'victory' : 'defeat'}`}>
            <span className="duel-final-badge-emoji">
              {isWinner ? '🏆' : '💀'}
            </span>
          </div>
          <h1 className={`duel-final-title ${isWinner ? 'victory' : 'defeat'}`}>
            {isWinner ? 'Victory!' : 'Defeat'}
          </h1>
          <p className="duel-final-subtitle">
            {isWinner && forfeitBy === loser
              ? `You win! ${loserUsername} forfeited.`
              : isWinner
                ? `You defeated ${loserUsername} in ${totalRounds} rounds!`
                : `${winnerUsername} won after ${totalRounds} rounds`}
          </p>
        </div>

        {/* Score Summary */}
        <div className="duel-final-summary duel-final-summary-multi">
          {standings.map((p, idx) => {
            const isWinnerCard = p.uid === winner;
            return (
              <div key={p.uid} className={`duel-final-player-card ${isWinnerCard ? 'winner-card' : 'loser-card'}`}>
                <span className="duel-final-card-label">
                  {isWinnerCard ? '👑 Winner' : `#${idx + 1}`}
                </span>
                <span className="duel-final-card-name">
                  {p.username}{p.uid === myUid ? ' (You)' : ''}
                </span>
                <span className="duel-final-card-score">{p.totalScore.toLocaleString()}</span>
                <span className="duel-final-card-sub">Total Points</span>
                <div className="duel-final-card-health">
                  <div className="duel-final-card-health-bar">
                    <div
                      className={`duel-final-card-health-fill ${isWinnerCard ? 'green' : 'red'}`}
                      style={{ width: `${Math.max(0, (p.finalHealth / STARTING_HEALTH) * 100)}%` }}
                    />
                  </div>
                  <span className="duel-final-card-health-value">{p.finalHealth.toLocaleString()} HP</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Round History */}
        <div className="duel-final-history">
          <h2 className="duel-final-history-title">Round History</h2>
          <div className="duel-final-rounds-list">
            {roundHistory.map((round: RoundHistory, index: number) => {
              const roundPlayers = round.players || {};
              const scores = Object.entries(roundPlayers).map(([uid, data]) => ({
                uid,
                username: players.find(p => p.uid === uid)?.username || 'Unknown',
                score: (data?.score as number) || 0
              })).sort((a, b) => b.score - a.score);
              const top = scores[0];

              return (
                <div key={index} className="duel-final-round-item">
                  <div className="duel-final-round-header">
                    <span className="duel-final-round-num">Round {round.roundNumber}</span>
                    <span className="duel-final-round-mult">{round.multiplier}x</span>
                  </div>

                  <div className="duel-final-round-scores">
                    <div className="duel-final-round-player round-winner">
                      <span className="duel-frp-name">Top</span>
                      <span className="duel-frp-score">
                        {top ? `${top.username} • ${top.score.toLocaleString()}` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="duel-final-round-damage">
                    {round.damage > 0 ? (
                      <span className="duel-frd-text">
                        -{round.damage.toLocaleString()} HP to{' '}
                        {players.find(p => p.uid === round.damagedPlayer)?.username || 'Unknown'}
                      </span>
                    ) : (
                      <span className="duel-frd-text duel-frd-tie">Tie - No damage</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="duel-final-actions">
          <button className="duel-final-play-again" onClick={onPlayAgain}>
            <span className="button-icon">🔄</span>
            Play Again
          </button>
          <button className="duel-final-home" onClick={onBackToTitle}>
            <span className="button-icon">🏠</span>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default DuelFinalScreen;
