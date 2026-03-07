import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { awardXp } from '../../services/xpService';
import { updateUserDoc } from '../../services/userService';
import { increment } from 'firebase/firestore';
import { calculateXpGain, getLevelTitle } from '../../utils/xpLevelling';
import { useDailyGoals } from '../../hooks/useDailyGoals';
import { GOAL_TYPES } from '../../utils/dailyGoalDefinitions';
import CopyResultsButton from '../CopyResultsButton/CopyResultsButton';
import { generateShareableResultsText } from '../../utils/shareResults';
import './FinalResultsScreen.css';

interface PerformanceRating {
  rating: string;
  emoji: string;
  class: string;
}

interface LevelInfo {
  level: number;
  progress: number;
  xpIntoLevel: number;
  currentLevelXp: number;
}

interface XpResult {
  levelsGained: number;
  previousLevel: number;
  newLevel: number;
  levelInfo: LevelInfo;
}

interface RoundData {
  roundNumber?: number;
  score: number;
  locationScore: number;
  imageUrl: string;
  floorCorrect: boolean | null;
  timeTakenSeconds?: number;
  actualFloor?: number | null;
  imageBuildingName?: string | null;
  imageDescription?: string | null;
  noGuess?: boolean;
}

interface ConfettiPiece {
  id: number;
  left: string;
  delay: string;
  color: string;
}

type RoundCountKey = '5' | '10' | '20';

interface RoundBucketStats {
  gamesPlayed: number;
  roundsPlayed: number;
  totalScore: number;
  totalGuessTimeSeconds: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount: number;
  twentyFiveKCount: number;
  buildingStats: Record<string, {
    building: string;
    floor: number | null;
    totalScore: number;
    count: number;
  }>;
}

/**
 * Calculate performance rating based on total score (classic mode)
 */
function getPerformanceRating(totalScore: number, maxPossible: number): PerformanceRating {
  const percentage = (totalScore / maxPossible) * 100;
  if (percentage >= 95) return { rating: 'Perfect!', emoji: '🏆', class: 'perfect' };
  if (percentage >= 80) return { rating: 'Excellent!', emoji: '🌟', class: 'excellent' };
  if (percentage >= 60) return { rating: 'Great!', emoji: '👏', class: 'great' };
  if (percentage >= 40) return { rating: 'Good', emoji: '👍', class: 'good' };
  if (percentage >= 20) return { rating: 'Keep Practicing', emoji: '📍', class: 'okay' };
  return { rating: 'Beginner', emoji: '🎯', class: 'beginner' };
}

/**
 * Calculate performance rating for endless mode based on rounds survived
 */
function getEndlessPerformanceRating(roundsSurvived: number): PerformanceRating {
  if (roundsSurvived >= 16) return { rating: 'Legendary!', emoji: '🏆', class: 'perfect' };
  if (roundsSurvived >= 11) return { rating: 'Excellent!', emoji: '🌟', class: 'excellent' };
  if (roundsSurvived >= 8) return { rating: 'Great!', emoji: '👏', class: 'great' };
  if (roundsSurvived >= 5) return { rating: 'Good', emoji: '👍', class: 'good' };
  if (roundsSurvived >= 3) return { rating: 'Keep Practicing', emoji: '📍', class: 'okay' };
  return { rating: 'Beginner', emoji: '🎯', class: 'beginner' };
}

function formatRoundTime(timeTakenSeconds: number | undefined): string {
  if (typeof timeTakenSeconds !== 'number' || !Number.isFinite(timeTakenSeconds) || timeTakenSeconds < 0) {
    return '--';
  }
  if (timeTakenSeconds >= 60) {
    const minutes = Math.floor(timeTakenSeconds / 60);
    const seconds = timeTakenSeconds - minutes * 60;
    return `${minutes}m ${seconds.toFixed(2)}s`;
  }
  return `${timeTakenSeconds.toFixed(2)}s`;
}

const CONFETTI_COLORS: string[] = ['#6cb52d', '#ffc107', '#ff4757', '#3498db', '#9b59b6'];
const processedStatsWriteKeys = new Set<string>();

/**
 * Generate confetti data once (outside render to avoid impure calls during render)
 */
function generateConfettiData(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]
  }));
}

export interface FinalResultsScreenProps {
  rounds: RoundData[];
  onPlayAgain: () => void;
  onBackToTitle: () => void;
  difficulty: string | null;
  isEndlessMode?: boolean;
  mode?: string | null;
}

function FinalResultsScreen({ rounds, onPlayAgain, onBackToTitle, difficulty, isEndlessMode = false, mode = null }: FinalResultsScreenProps): React.ReactElement {
  const { user, userDoc, totalXp, refreshUserDoc } = useAuth();
  const { recordProgress } = useDailyGoals(user?.uid ?? null);
  const [animationComplete, setAnimationComplete] = useState<boolean>(false);
  const [displayedTotal, setDisplayedTotal] = useState<number>(0);
  const [showLevelUp, setShowLevelUp] = useState<boolean>(false);
  const xpAwarded = useRef<boolean>(false);
  const totalScore = rounds.reduce((sum: number, round: RoundData) => sum + round.score, 0);
  const roundsSurvived = rounds.length;
  const maxPossible = rounds.length * 5000;
  const averageScore = rounds.length > 0 ? totalScore / rounds.length : 0;
  const roundedAverageScore = Math.round(averageScore);
  const isPerfectAverageScore = roundedAverageScore === 5000;
  const performance = isEndlessMode
    ? getEndlessPerformanceRating(roundsSurvived)
    : getPerformanceRating(totalScore, maxPossible);
  const totalGuessTimeSeconds = rounds.reduce((sum: number, round: RoundData) => sum + (round.timeTakenSeconds ?? 0), 0);
  const sessionFastestGuessTimeSeconds = rounds.reduce<number | null>((fastest, round) => {
    if (round.noGuess) return fastest;
    const time = round.timeTakenSeconds;
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) return fastest;
    return fastest === null ? time : Math.min(fastest, time);
  }, null);
  const averageGuessTimeSeconds = rounds.length > 0 ? totalGuessTimeSeconds / rounds.length : 0;
  const isPerfectRound = (round: RoundData): boolean =>
    round.locationScore === 5000 && round.floorCorrect !== false;
  const fiveKCount = rounds.filter(isPerfectRound).length;
  const twentyFiveKCount = rounds.length > 0 && rounds.every(isPerfectRound) ? 1 : 0;
  const getLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const normalizeBuildingName = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const shareText = useMemo(() => {
    return generateShareableResultsText({
      rounds: rounds.map((r, idx) => ({
        score: r.score,
        roundNumber: r.roundNumber ?? (idx + 1)
      })),
      gameName: 'HW Geoguessr',
      mode,
      difficulty
    });
  }, [rounds, mode, difficulty]);

  // Snapshot the totalXp at mount so it doesn't shift after the Firestore refresh.
  // useState initializer only runs once, so this captures the pre-award value.
  const [snapshotXp] = useState<number>(() => totalXp);
  const [snapshotGamesPlayed] = useState<number>(() => userDoc?.gamesPlayed ?? 0);

  // Compute XP result from the snapshotted totalXp
  const xpResult: XpResult = useMemo(
    () => calculateXpGain(snapshotXp, totalScore),
    [snapshotXp, totalScore]
  );

  // Generate confetti data once and memoize it
  const confettiPieces = useMemo(() => generateConfettiData(30), []);

  // Build an idempotency key so StrictMode remounts don't double-write stats.
  const statsWriteKey = useMemo(() => {
    const uid = user?.uid ?? 'anonymous';
    const roundSignature = rounds
      .map((round) => `${round.roundNumber ?? 0}:${round.imageUrl}:${round.score}:${round.timeTakenSeconds ?? -1}`)
      .join('|');
    return `${uid}::${snapshotGamesPlayed}::${snapshotXp}::${difficulty ?? 'all'}::${rounds.length}::${totalScore}::${roundSignature}`;
  }, [user?.uid, snapshotGamesPlayed, snapshotXp, difficulty, rounds, totalScore]);

  // Award XP on mount (once per game completion)
  useEffect(() => {
    if (xpAwarded.current || !user) return;
    if (processedStatsWriteKeys.has(statsWriteKey)) return;
    xpAwarded.current = true;
    processedStatsWriteKeys.add(statsWriteKey);

    // Persist to Firestore, then refresh local user doc
    awardXp(user.uid, totalScore)
      .then(async () => {
        const existingBuildingStats = userDoc?.buildingStats ?? {};
        const updatedBuildingStats: typeof existingBuildingStats = { ...existingBuildingStats };
        const todayKey = getLocalDateKey(new Date());
        const difficultyKey = difficulty ?? 'all';
        const existingDailyStats = userDoc?.dailyStats ?? {};
        const existingDailyStatsByDifficulty = userDoc?.dailyStatsByDifficulty ?? {};
        const roundCountBucket: RoundCountKey | null =
          rounds.length === 5 || rounds.length === 10 || rounds.length === 20
            ? String(rounds.length) as RoundCountKey
            : null;
        const existingFastestGuessTimeSeconds =
          typeof userDoc?.fastestGuessTimeSeconds === 'number' ? userDoc.fastestGuessTimeSeconds : null;
        const nextFastestGuessTimeSeconds =
          sessionFastestGuessTimeSeconds === null
            ? existingFastestGuessTimeSeconds
            : existingFastestGuessTimeSeconds === null
              ? sessionFastestGuessTimeSeconds
              : Math.min(existingFastestGuessTimeSeconds, sessionFastestGuessTimeSeconds);
        const dayStats = existingDailyStats[todayKey] ?? {
          gamesPlayed: 0,
          roundsPlayed: 0,
          totalScore: 0,
          totalGuessTimeSeconds: 0,
          fastestGuessTimeSeconds: undefined,
          fiveKCount: 0,
          twentyFiveKCount: 0,
          photosSubmittedCount: 0,
          buildingStats: {}
        };
        const dayStatsByDifficulty = existingDailyStatsByDifficulty[todayKey]?.[difficultyKey] ?? {
          gamesPlayed: 0,
          roundsPlayed: 0,
          totalScore: 0,
          totalGuessTimeSeconds: 0,
          fastestGuessTimeSeconds: undefined,
          fiveKCount: 0,
          twentyFiveKCount: 0,
          photosSubmittedCount: 0,
          buildingStats: {}
        };
        const currentDayRoundBucket: RoundBucketStats | null = roundCountBucket
          ? (dayStats.byRoundCount?.[roundCountBucket] as RoundBucketStats | undefined) ?? {
            gamesPlayed: 0,
            roundsPlayed: 0,
            totalScore: 0,
            totalGuessTimeSeconds: 0,
            fastestGuessTimeSeconds: undefined,
            fiveKCount: 0,
            twentyFiveKCount: 0,
            buildingStats: {}
          }
          : null;
        const currentDayDiffRoundBucket: RoundBucketStats | null = roundCountBucket
          ? (dayStatsByDifficulty.byRoundCount?.[roundCountBucket] as RoundBucketStats | undefined) ?? {
            gamesPlayed: 0,
            roundsPlayed: 0,
            totalScore: 0,
            totalGuessTimeSeconds: 0,
            fastestGuessTimeSeconds: undefined,
            fiveKCount: 0,
            twentyFiveKCount: 0,
            buildingStats: {}
          }
          : null;
        const updatedDayBuildingStats = { ...dayStats.buildingStats };
        const updatedDayBuildingStatsByDifficulty = { ...dayStatsByDifficulty.buildingStats };
        const updatedDayRoundBuildingStats = { ...(currentDayRoundBucket?.buildingStats ?? {}) };
        const updatedDayDiffRoundBuildingStats = { ...(currentDayDiffRoundBucket?.buildingStats ?? {}) };

        for (const round of rounds) {
          const buildingName =
            normalizeBuildingName(round.imageBuildingName) ??
            normalizeBuildingName(round.imageDescription) ??
            'Unknown';
          const floor = round.actualFloor ?? null;
          const key = `${buildingName}::${floor ?? 'unknown'}`;
          const current = updatedBuildingStats[key] ?? {
            building: buildingName,
            floor,
            totalScore: 0,
            count: 0
          };
          updatedBuildingStats[key] = {
            building: current.building,
            floor: current.floor ?? floor,
            totalScore: current.totalScore + round.score,
            count: current.count + 1
          };

          const dayCurrent = updatedDayBuildingStats[key] ?? {
            building: buildingName,
            floor,
            totalScore: 0,
            count: 0
          };
          updatedDayBuildingStats[key] = {
            building: dayCurrent.building,
            floor: dayCurrent.floor ?? floor,
            totalScore: dayCurrent.totalScore + round.score,
            count: dayCurrent.count + 1
          };

          const dayDiffCurrent = updatedDayBuildingStatsByDifficulty[key] ?? {
            building: buildingName,
            floor,
            totalScore: 0,
            count: 0
          };
          updatedDayBuildingStatsByDifficulty[key] = {
            building: dayDiffCurrent.building,
            floor: dayDiffCurrent.floor ?? floor,
            totalScore: dayDiffCurrent.totalScore + round.score,
            count: dayDiffCurrent.count + 1
          };

          if (currentDayRoundBucket) {
            const roundBucketCurrent = updatedDayRoundBuildingStats[key] ?? {
              building: buildingName,
              floor,
              totalScore: 0,
              count: 0
            };
            updatedDayRoundBuildingStats[key] = {
              building: roundBucketCurrent.building,
              floor: roundBucketCurrent.floor ?? floor,
              totalScore: roundBucketCurrent.totalScore + round.score,
              count: roundBucketCurrent.count + 1
            };
          }

          if (currentDayDiffRoundBucket) {
            const roundDiffBucketCurrent = updatedDayDiffRoundBuildingStats[key] ?? {
              building: buildingName,
              floor,
              totalScore: 0,
              count: 0
            };
            updatedDayDiffRoundBuildingStats[key] = {
              building: roundDiffBucketCurrent.building,
              floor: roundDiffBucketCurrent.floor ?? floor,
              totalScore: roundDiffBucketCurrent.totalScore + round.score,
              count: roundDiffBucketCurrent.count + 1
            };
          }
        }

        const nextDayFastestGuessTime =
          sessionFastestGuessTimeSeconds === null
            ? dayStats.fastestGuessTimeSeconds
            : typeof dayStats.fastestGuessTimeSeconds === 'number'
              ? Math.min(dayStats.fastestGuessTimeSeconds, sessionFastestGuessTimeSeconds)
              : sessionFastestGuessTimeSeconds;
        const nextDayDifficultyFastestGuessTime =
          sessionFastestGuessTimeSeconds === null
            ? dayStatsByDifficulty.fastestGuessTimeSeconds
            : typeof dayStatsByDifficulty.fastestGuessTimeSeconds === 'number'
              ? Math.min(dayStatsByDifficulty.fastestGuessTimeSeconds, sessionFastestGuessTimeSeconds)
              : sessionFastestGuessTimeSeconds;
        const nextDayRoundFastestGuessTime =
          currentDayRoundBucket && sessionFastestGuessTimeSeconds !== null
            ? (typeof currentDayRoundBucket.fastestGuessTimeSeconds === 'number'
              ? Math.min(currentDayRoundBucket.fastestGuessTimeSeconds, sessionFastestGuessTimeSeconds)
              : sessionFastestGuessTimeSeconds)
            : currentDayRoundBucket?.fastestGuessTimeSeconds;
        const nextDayDiffRoundFastestGuessTime =
          currentDayDiffRoundBucket && sessionFastestGuessTimeSeconds !== null
            ? (typeof currentDayDiffRoundBucket.fastestGuessTimeSeconds === 'number'
              ? Math.min(currentDayDiffRoundBucket.fastestGuessTimeSeconds, sessionFastestGuessTimeSeconds)
              : sessionFastestGuessTimeSeconds)
            : currentDayDiffRoundBucket?.fastestGuessTimeSeconds;

        await updateUserDoc(user.uid, {
          totalScore: increment(totalScore),
          totalGuessTimeSeconds: increment(totalGuessTimeSeconds),
          ...(nextFastestGuessTimeSeconds !== null ? { fastestGuessTimeSeconds: nextFastestGuessTimeSeconds } : {}),
          fiveKCount: increment(fiveKCount),
          twentyFiveKCount: increment(twentyFiveKCount),
          buildingStats: updatedBuildingStats,
          dailyStats: {
            ...existingDailyStats,
            [todayKey]: {
              gamesPlayed: dayStats.gamesPlayed + 1,
              roundsPlayed: (dayStats.roundsPlayed ?? (dayStats.gamesPlayed ?? 0) * 5) + rounds.length,
              totalScore: dayStats.totalScore + totalScore,
              totalGuessTimeSeconds: dayStats.totalGuessTimeSeconds + totalGuessTimeSeconds,
              ...(typeof nextDayFastestGuessTime === 'number' ? { fastestGuessTimeSeconds: nextDayFastestGuessTime } : {}),
              fiveKCount: dayStats.fiveKCount + fiveKCount,
              twentyFiveKCount: dayStats.twentyFiveKCount + twentyFiveKCount,
              photosSubmittedCount: dayStats.photosSubmittedCount,
              buildingStats: updatedDayBuildingStats,
              ...(roundCountBucket && currentDayRoundBucket ? {
                byRoundCount: {
                  ...(dayStats.byRoundCount ?? {}),
                  [roundCountBucket]: {
                    gamesPlayed: currentDayRoundBucket.gamesPlayed + 1,
                    roundsPlayed: currentDayRoundBucket.roundsPlayed + rounds.length,
                    totalScore: currentDayRoundBucket.totalScore + totalScore,
                    totalGuessTimeSeconds: currentDayRoundBucket.totalGuessTimeSeconds + totalGuessTimeSeconds,
                    ...(typeof nextDayRoundFastestGuessTime === 'number' ? { fastestGuessTimeSeconds: nextDayRoundFastestGuessTime } : {}),
                    fiveKCount: currentDayRoundBucket.fiveKCount + fiveKCount,
                    twentyFiveKCount: currentDayRoundBucket.twentyFiveKCount + twentyFiveKCount,
                    buildingStats: updatedDayRoundBuildingStats
                  }
                }
              } : {})
            }
          },
          dailyStatsByDifficulty: {
            ...existingDailyStatsByDifficulty,
            [todayKey]: {
              ...(existingDailyStatsByDifficulty[todayKey] ?? {}),
              [difficultyKey]: {
                gamesPlayed: dayStatsByDifficulty.gamesPlayed + 1,
                roundsPlayed: (dayStatsByDifficulty.roundsPlayed ?? (dayStatsByDifficulty.gamesPlayed ?? 0) * 5) + rounds.length,
                totalScore: dayStatsByDifficulty.totalScore + totalScore,
                totalGuessTimeSeconds: dayStatsByDifficulty.totalGuessTimeSeconds + totalGuessTimeSeconds,
                ...(typeof nextDayDifficultyFastestGuessTime === 'number' ? { fastestGuessTimeSeconds: nextDayDifficultyFastestGuessTime } : {}),
                fiveKCount: dayStatsByDifficulty.fiveKCount + fiveKCount,
                twentyFiveKCount: dayStatsByDifficulty.twentyFiveKCount + twentyFiveKCount,
                photosSubmittedCount: dayStatsByDifficulty.photosSubmittedCount,
                buildingStats: updatedDayBuildingStatsByDifficulty,
                ...(roundCountBucket && currentDayDiffRoundBucket ? {
                  byRoundCount: {
                    ...(dayStatsByDifficulty.byRoundCount ?? {}),
                    [roundCountBucket]: {
                      gamesPlayed: currentDayDiffRoundBucket.gamesPlayed + 1,
                      roundsPlayed: currentDayDiffRoundBucket.roundsPlayed + rounds.length,
                      totalScore: currentDayDiffRoundBucket.totalScore + totalScore,
                      totalGuessTimeSeconds: currentDayDiffRoundBucket.totalGuessTimeSeconds + totalGuessTimeSeconds,
                      ...(typeof nextDayDiffRoundFastestGuessTime === 'number' ? { fastestGuessTimeSeconds: nextDayDiffRoundFastestGuessTime } : {}),
                      fiveKCount: currentDayDiffRoundBucket.fiveKCount + fiveKCount,
                      twentyFiveKCount: currentDayDiffRoundBucket.twentyFiveKCount + twentyFiveKCount,
                      buildingStats: updatedDayDiffRoundBuildingStats
                    }
                  }
                } : {})
              }
            }
          }
        });
        await refreshUserDoc();
      })
      .catch((err: Error) => {
        processedStatsWriteKeys.delete(statsWriteKey);
        console.error('Failed to award XP:', err);
      });

    // --- Daily Goals Progress --- (run in sequence so doc is created once, then all updates apply)
    (async () => {
      await recordProgress(GOAL_TYPES.GAMES_PLAYED, 1);
      for (const round of rounds) {
        if (round.score > 0) {
          await recordProgress(GOAL_TYPES.HIGH_SCORE_ROUND, round.score);
        }
        if (round.floorCorrect === true) {
          await recordProgress(GOAL_TYPES.PERFECT_FLOOR, 1);
        }
      }
      await recordProgress(GOAL_TYPES.HIGH_SCORE_GAME, totalScore);
      if (difficulty) {
        await recordProgress(GOAL_TYPES.PLAY_DIFFICULTY, 1, { targetDifficulty: difficulty });
      }
    })().catch((err: Error) => {
      processedStatsWriteKeys.delete(statsWriteKey);
      console.error('Failed to record daily goal progress:', err);
    });

    // Show level-up animation after a delay
    if (xpResult.levelsGained > 0) {
      setTimeout(() => setShowLevelUp(true), 2000);
    }
  }, [user, userDoc, totalScore, refreshUserDoc, xpResult, rounds, difficulty, recordProgress, totalGuessTimeSeconds, fiveKCount, twentyFiveKCount, statsWriteKey]);

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

  // Animate total score
  useEffect(() => {
    const duration = 1500;
    const steps = 50;
    const increment = totalScore / steps;
    let current = 0;

    const interval = setInterval(() => {
      current += increment;
      if (current >= totalScore) {
        setDisplayedTotal(totalScore);
        clearInterval(interval);
        setTimeout(() => setAnimationComplete(true), 300);
      } else {
        setDisplayedTotal(Math.round(current));
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [totalScore]);

  return (
    <div className="final-results-screen">
      <div className="final-results-background">
        <div className="confetti-container">
          {animationComplete && performance.class !== 'beginner' && performance.class !== 'okay' && (
            <>
              {confettiPieces.map((piece: ConfettiPiece) => (
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
            </>
          )}
        </div>
      </div>

      {/* Level-Up Overlay */}
      {showLevelUp && xpResult && (
        <div className="level-up-overlay" onClick={() => setShowLevelUp(false)}>
          <div className="level-up-card">
            <div className="level-up-glow"></div>
            <span className="level-up-icon">⬆️</span>
            <h2 className="level-up-title">Level Up!</h2>
            <div className="level-up-levels">
              <span className="level-up-old">Lvl {xpResult.previousLevel}</span>
              <span className="level-up-arrow">→</span>
              <span className="level-up-new">Lvl {xpResult.newLevel}</span>
            </div>
            <p className="level-up-rank">{getLevelTitle(xpResult.newLevel)}</p>
            <button className="level-up-dismiss" onClick={() => setShowLevelUp(false)}>
              Awesome!
            </button>
          </div>
        </div>
      )}

      <div className="final-results-content">
        {/* LEFT COLUMN — summary */}
        <div className="final-results-left">
          {/* Header with performance */}
          <div className="results-hero">
            <div className={`performance-badge ${performance.class}`}>
              <span className="performance-emoji">{performance.emoji}</span>
            </div>
            <h1 className="results-title">
              {isEndlessMode ? 'Game Over!' : 'Game Complete!'}
            </h1>
            <p className={`performance-text ${performance.class}`}>
              {isEndlessMode
                ? `You survived ${roundsSurvived} round${roundsSurvived === 1 ? '' : 's'}! ${performance.rating}`
                : performance.rating}
            </p>
          </div>

          {/* Total Score Display */}
          <div className="total-score-container">
            <div className="total-score-box">
              <span className="total-label">Total Score</span>
              <span className="total-value">{displayedTotal.toLocaleString()}</span>
              <span className="total-max">
                {isEndlessMode ? ' points' : ` / ${maxPossible.toLocaleString()} points`}
              </span>
            </div>
            {isEndlessMode && (
              <div className="endless-rounds-survived">
                Rounds survived: {roundsSurvived}
              </div>
            )}
          </div>

          {/* XP Gained Section */}
          {xpResult && (
            <div className="xp-gained-section">
              <div className="xp-gained-box">
                <div className="xp-gained-header">
                  <span className="xp-gained-icon">✨</span>
                  <span className="xp-gained-label">XP Earned</span>
                </div>
                <span className="xp-gained-value">+{totalScore.toLocaleString()} XP</span>
                <div className="xp-level-info">
                  <span className="xp-level-badge">Lvl {xpResult.levelInfo.level}</span>
                  <span className="xp-level-title">{getLevelTitle(xpResult.levelInfo.level)}</span>
                </div>
                <div className="xp-progress-bar-container">
                  <div className="xp-progress-bar">
                    <div
                      className="xp-progress-fill"
                      style={{ width: `${Math.round(xpResult.levelInfo.progress * 100)}%` }}
                    />
                  </div>
                  <span className="xp-progress-text">
                    {xpResult.levelInfo.xpIntoLevel.toLocaleString()} / {xpResult.levelInfo.currentLevelXp.toLocaleString()} XP
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — round details + actions */}
        <div className="final-results-right">
          {/* Round by Round Breakdown */}
          <div className="rounds-breakdown">
            <h2 className="breakdown-title">Round Breakdown</h2>
            <div className="rounds-list">
              {rounds.map((round: RoundData, index: number) => (
                <div key={index} className="round-item">
                  <div className="round-number">Round {index + 1}</div>
                  <div className="round-details">
                    <div className="round-image">
                      <img src={round.imageUrl} alt={`Round ${index + 1}`} />
                    </div>
                    <div className="round-stats">
                      <div className="round-stat">
                        <span className="round-stat-label">Location</span>
                        <span className="round-stat-value">
                          {round.noGuess ? 'No guess' : round.locationScore.toLocaleString()}
                        </span>
                      </div>
                      <div className="round-stat">
                        <span className="round-stat-label">Floor</span>
                        {round.noGuess || round.floorCorrect === null || round.floorCorrect === undefined ? (
                          <span className="round-stat-value">--</span>
                        ) : (
                          <span className={`round-stat-value ${round.floorCorrect ? 'correct' : 'penalty'}`}>
                            {round.floorCorrect ? '✓' : '-20%'}
                          </span>
                        )}
                      </div>
                      <div className="round-stat">
                        <span className="round-stat-label">Time</span>
                        <span className="round-stat-value">{formatRoundTime(round.timeTakenSeconds)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="round-score">
                    <span className="round-score-value">{round.score.toLocaleString()}</span>
                    <span className="round-score-label">pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {rounds.length > 0 && (
            <div className="average-score-summary">
              <h2 className="breakdown-title average-summary-title">Per-round averages</h2>
              <div className="average-score-metrics">
                <div className="average-metric">
                  <span className="average-metric-label">Avg score</span>
                  <span className={`average-score-value ${isPerfectAverageScore ? 'perfect' : ''}`}>
                    {roundedAverageScore.toLocaleString()} pts
                  </span>
                </div>
                <div className="average-metric">
                  <span className="average-metric-label">Avg time</span>
                  <span className="average-time-value">{formatRoundTime(averageGuessTimeSeconds)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="final-actions">
            <CopyResultsButton text={shareText} />
            <button className="play-again-button" onClick={onPlayAgain}>
              <span className="button-icon">🔄</span>
              Play Again
            </button>
            <button className="home-button" onClick={onBackToTitle}>
              <span className="button-icon">🏠</span>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FinalResultsScreen;
