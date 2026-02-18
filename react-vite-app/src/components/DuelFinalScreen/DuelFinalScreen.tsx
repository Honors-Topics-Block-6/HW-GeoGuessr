import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { STARTING_HEALTH } from '../../services/duelService';
import { useDailyGoals } from '../../hooks/useDailyGoals';
import { GOAL_TYPES } from '../../utils/dailyGoalDefinitions';
import { useAuth } from '../../contexts/AuthContext';
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
  onPlayAgain,
  onBackToTitle
}: DuelFinalScreenProps): React.ReactElement {
  const [animationComplete, setAnimationComplete] = useState<boolean>(false);
  const { refreshUserDoc } = useAuth();
  const { recordProgress } = useDailyGoals(myUid, {
    onGoalCompleted: async (_completedCount: number) => {
      await refreshUserDoc();
    },
    onAllCompleted: async () => {
      await refreshUserDoc();
    }
  });
  const goalsRecorded = useRef<boolean>(false);

  const confettiPieces = useMemo(() => generateConfettiData(40), []);

  const isWinner = winner === myUid;
  const winnerPlayer = players.find((p: DuelPlayer) => p.uid === winner);
  const loserPlayer = players.find((p: DuelPlayer) => p.uid === loser);
  const winnerUsername = winnerPlayer?.username || 'Winner';
  const loserUsername = loserPlayer?.username || 'Loser';

  // My opponent
  const opponent = players.find((p: DuelPlayer) => p.uid !== myUid);
  const opponentUid = opponent?.uid || null;
  const myUsername = players.find((p: DuelPlayer) => p.uid === myUid)?.username || 'You';
  const opponentUsername = opponent?.username || 'Opponent';

  // Calculate total scores
  const totalRounds = roundHistory.length;
  const myTotalScore = roundHistory.reduce((sum: number, r: RoundHistory) => sum + (r.players?.[myUid]?.score || 0), 0);
  const opTotalScore = roundHistory.reduce((sum: number, r: RoundHistory) => sum + (r.players?.[opponentUid || '']?.score || 0), 0);

  // Final health
  const myFinalHealth = health?.[myUid] ?? 0;
  const opFinalHealth = health?.[opponentUid || ''] ?? 0;

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

  // Record daily goal progress for duel completion
  useEffect(() => {
    if (goalsRecorded.current || !myUid) return;
    goalsRecorded.current = true;

    // Goal: play a duel
    recordProgress(GOAL_TYPES.PLAY_DUEL, 1);

    // Goal: win a duel
    if (winner === myUid) {
      recordProgress(GOAL_TYPES.WIN_DUEL, 1);
    }

    // Goal: games played (duels count as games)
    recordProgress(GOAL_TYPES.GAMES_PLAYED, 1);
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
            {isWinner
              ? `You defeated ${loserUsername} in ${totalRounds} rounds!`
              : `${winnerUsername} won after ${totalRounds} rounds`}
          </p>
        </div>

        {/* Score Summary */}
        <div className="duel-final-summary">
          <div className={`duel-final-player-card ${isWinner ? 'winner-card' : 'loser-card'}`}>
            <span className="duel-final-card-label">
              {isWinner ? '👑 Winner' : ''}
            </span>
            <span className="duel-final-card-name">{myUsername}</span>
            <span className="duel-final-card-score">{myTotalScore.toLocaleString()}</span>
            <span className="duel-final-card-sub">Total Points</span>
            <div className="duel-final-card-health">
              <div className="duel-final-card-health-bar">
                <div
                  className="duel-final-card-health-fill green"
                  style={{ width: `${(myFinalHealth / STARTING_HEALTH) * 100}%` }}
                />
              </div>
              <span className="duel-final-card-health-value">{myFinalHealth.toLocaleString()} HP</span>
            </div>
          </div>

          <div className="duel-final-vs">VS</div>

          <div className={`duel-final-player-card ${!isWinner ? 'winner-card' : 'loser-card'}`}>
            <span className="duel-final-card-label">
              {!isWinner ? '👑 Winner' : ''}
            </span>
            <span className="duel-final-card-name">{opponentUsername}</span>
            <span className="duel-final-card-score">{opTotalScore.toLocaleString()}</span>
            <span className="duel-final-card-sub">Total Points</span>
            <div className="duel-final-card-health">
              <div className="duel-final-card-health-bar">
                <div
                  className="duel-final-card-health-fill red"
                  style={{ width: `${(opFinalHealth / STARTING_HEALTH) * 100}%` }}
                />
              </div>
              <span className="duel-final-card-health-value">{opFinalHealth.toLocaleString()} HP</span>
            </div>
          </div>
        </div>

        {/* Round History */}
        <div className="duel-final-history">
          <h2 className="duel-final-history-title">Round History</h2>
          <div className="duel-final-rounds-list">
            {roundHistory.map((round: RoundHistory, index: number) => {
              const myRoundData = round.players?.[myUid] || {};
              const opRoundData = round.players?.[opponentUid || ''] || {};
              const myRoundScore = (myRoundData.score as number) || 0;
              const opRoundScore = (opRoundData.score as number) || 0;
              const iWonRound = myRoundScore > opRoundScore;
              const tiedRound = myRoundScore === opRoundScore;
              const myHealthAfter = round.healthAfter?.[myUid] ?? 0;
              const opHealthAfter = round.healthAfter?.[opponentUid || ''] ?? 0;

              return (
                <div key={index} className="duel-final-round-item">
                  <div className="duel-final-round-header">
                    <span className="duel-final-round-num">Round {round.roundNumber}</span>
                    <span className="duel-final-round-mult">{round.multiplier}x</span>
                  </div>

                  <div className="duel-final-round-scores">
                    <div className={`duel-final-round-player ${iWonRound && !tiedRound ? 'round-winner' : ''}`}>
                      <span className="duel-frp-name">{myUsername}</span>
                      <span className="duel-frp-score">{myRoundScore.toLocaleString()}</span>
                    </div>
                    <span className="duel-final-round-vs">vs</span>
                    <div className={`duel-final-round-player ${!iWonRound && !tiedRound ? 'round-winner' : ''}`}>
                      <span className="duel-frp-name">{opponentUsername}</span>
                      <span className="duel-frp-score">{opRoundScore.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="duel-final-round-damage">
                    {round.damage > 0 ? (
                      <span className="duel-frd-text">
                        -{round.damage.toLocaleString()} HP to{' '}
                        {round.damagedPlayer === myUid ? myUsername : opponentUsername}
                      </span>
                    ) : (
                      <span className="duel-frd-text duel-frd-tie">Tie - No damage</span>
                    )}
                  </div>

                  <div className="duel-final-round-health">
                    <div className="duel-frh-bar-wrapper">
                      <div className="duel-frh-bar">
                        <div
                          className="duel-frh-fill green"
                          style={{ width: `${(myHealthAfter / STARTING_HEALTH) * 100}%` }}
                        />
                      </div>
                      <span className="duel-frh-val">{myHealthAfter.toLocaleString()}</span>
                    </div>
                    <div className="duel-frh-bar-wrapper">
                      <div className="duel-frh-bar">
                        <div
                          className="duel-frh-fill red"
                          style={{ width: `${(opHealthAfter / STARTING_HEALTH) * 100}%` }}
                        />
                      </div>
                      <span className="duel-frh-val">{opHealthAfter.toLocaleString()}</span>
                    </div>
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
