import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type FieldValue
} from 'firebase/firestore';
import { db } from '../firebase';
import { getRandomImage } from './imageService';
import { calculateDistance, calculateLocationScore } from '../hooks/useGameState';
import { computeTimeMultiplier } from '../utils/timeScoring';

// ────── Types ──────

export interface MapLocation {
  x: number;
  y: number;
}

export interface DuelPlayer {
  uid: string;
  username: string;
}

export interface DuelImage {
  url: string;
  correctLocation: MapLocation;
  correctFloor: number | null;
  difficulty: string;
}

export interface DuelGuess {
  location: MapLocation | null;
  floor: number | null;
  score: number;
  locationScore: number;
  distance: number | null;
  floorCorrect: boolean | null;
  timedOut: boolean;
  noGuess: boolean;
  submittedAt: Timestamp;
  timeTakenSeconds?: number;
  /** Points deducted due to time */
  timePenalty?: number;
}

export interface GuessData {
  location: MapLocation | null;
  floor?: number | null;
  timedOut?: boolean;
  noGuess?: boolean;
}

export interface RoundPlayerResult {
  location: MapLocation | null;
  floor: number | null;
  score: number;
  locationScore: number;
  distance: number | null;
  floorCorrect: boolean | null;
  timedOut: boolean;
  noGuess: boolean;
  timeTakenSeconds?: number;
  /** Points deducted due to time */
  timePenalty?: number;
}

export interface RoundHistoryEntry {
  roundNumber: number;
  imageUrl: string;
  actualLocation: MapLocation;
  actualFloor: number | null;
  players: Record<string, RoundPlayerResult>;
  damage: number;
  multiplier: number;
  damagedPlayer: string | null;
  healthAfter: Record<string, number>;
}

export type DuelPhase = 'guessing' | 'results' | 'finished';

export interface DuelData {
  docId: string;
  hostUid: string;
  hostUsername: string;
  status: string;
  phase: DuelPhase;
  currentRound: number;
  currentImage: DuelImage;
  roundStartedAt: Timestamp;
  guesses: Record<string, DuelGuess>;
  health: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
  winner: string | null;
  loser: string | null;
  finishedAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  players: DuelPlayer[];
  difficulty: string;
  timePenaltyEnabled?: boolean;
}

// ────── Constants ──────

/** Starting health for each player */
export const STARTING_HEALTH = 6000;

/** Round time in seconds */
export const DUEL_ROUND_TIME_SECONDS = 20;

/** Minimum score multiplier at round end (0.5 = 50% of accuracy score at 20s) */
export const DUEL_TIME_MIN_MULTIPLIER = 0.5;

// ────── Functions ──────

/**
 * Get the damage multiplier for a given round number.
 * Escalates as rounds progress (GeoGuessr Duels style).
 *   Rounds 1-2: 1.0x
 *   Rounds 3-4: 1.5x
 *   Rounds 5+:  2.0x
 */
export function getDamageMultiplier(roundNumber: number): number {
  if (roundNumber <= 2) return 1.0;
  if (roundNumber <= 4) return 1.5;
  return 2.0;
}

/**
 * Start a duel game from the lobby.
 * Called by the host when both players are in the waiting room.
 * Loads the first image, initialises health, and sets phase to 'guessing'.
 */
export async function startDuel(
  docId: string,
  players: DuelPlayer[],
  difficulty: string
): Promise<void> {
  const image = await getRandomImage(difficulty);

  const health: Record<string, number> = {};
  players.forEach(p => {
    health[p.uid] = STARTING_HEALTH;
  });

  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    status: 'in_progress',
    phase: 'guessing',
    currentRound: 1,
    currentImage: {
      url: image!.url,
      correctLocation: image!.correctLocation || { x: 50, y: 50 },
      correctFloor: image!.correctFloor ?? null,
      difficulty: image!.difficulty || difficulty
    },
    roundStartedAt: Timestamp.now(),
    guesses: {},
    health,
    roundHistory: [],
    winner: null,
    loser: null,
    finishedAt: null,
    updatedAt: serverTimestamp()
  });
}

/** RoundStartedAt can be a Firestore Timestamp or millisecond number */
export type RoundStartedAt = Timestamp | number;

/**
 * Submit a player's guess for the current round.
 * Calculates score client-side using the same formula as singleplayer.
 * Time decay (points decrease as player takes longer) applies only in hard mode.
 */
export async function submitDuelGuess(
  docId: string,
  playerUid: string,
  guessData: GuessData,
  currentImage: DuelImage,
  roundStartedAt?: RoundStartedAt | null,
  timePenaltyEnabled?: boolean
): Promise<void> {
  let score = 0;
  let locationScore = 0;
  let distance: number | null = null;
  let floorCorrect: boolean | null = null;

  if (guessData.location && !guessData.noGuess) {
    const actualLocation = currentImage.correctLocation || { x: 50, y: 50 };
    distance = calculateDistance(guessData.location, actualLocation);
    locationScore = calculateLocationScore(distance);

    const actualFloor = currentImage.correctFloor ?? null;

    // Floor scoring logic (same as singleplayer)
    if (guessData.floor !== null && guessData.floor !== undefined && actualFloor !== null) {
      floorCorrect = guessData.floor === actualFloor;
      score = floorCorrect ? locationScore : Math.round(locationScore * 0.8);
    } else {
      score = locationScore;
    }
  }

  // Apply time decay only in hard mode: score decreases as player takes longer
  let timeTakenSeconds: number | undefined;
  let timePenalty: number | undefined;
  if (timePenaltyEnabled && roundStartedAt != null && score > 0) {
    const roundStartMs =
      typeof roundStartedAt === 'object' && roundStartedAt?.toMillis
        ? roundStartedAt.toMillis()
        : (roundStartedAt as number);
    timeTakenSeconds = Math.max(
      0,
      Math.min(DUEL_ROUND_TIME_SECONDS, (Date.now() - roundStartMs) / 1000)
    );
    const timeMultiplier = computeTimeMultiplier(
      timeTakenSeconds,
      DUEL_ROUND_TIME_SECONDS,
      DUEL_TIME_MIN_MULTIPLIER
    );
    const scoreBeforeTime = score;
    score = Math.round(score * timeMultiplier);
    timePenalty = scoreBeforeTime - score;
  }

  const lobbyRef = doc(db, 'lobbies', docId);
  const guessPayload: Record<string, unknown> = {
    location: guessData.location,
    floor: guessData.floor ?? null,
    score,
    locationScore,
    distance,
    floorCorrect,
    timedOut: guessData.timedOut || false,
    noGuess: guessData.noGuess || false,
    submittedAt: Timestamp.now()
  };
  if (timeTakenSeconds !== undefined) {
    guessPayload.timeTakenSeconds = timeTakenSeconds;
  }
  if (timePenalty !== undefined && timePenalty > 0) {
    guessPayload.timePenalty = timePenalty;
  }
  await updateDoc(lobbyRef, {
    [`guesses.${playerUid}`]: guessPayload,
    updatedAt: serverTimestamp()
  });
}

/**
 * Process the round after both players have guessed.
 * Calculates damage, updates health, pushes to roundHistory,
 * and either starts the next round or ends the game.
 *
 * Only the host should call this to avoid race conditions.
 */
export async function processRound(docId: string): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data() as DuelData;
  const { players, guesses, health, currentRound, currentImage, roundHistory = [] } = lobby;

  const playerUids = players.map(p => p.uid);
  if (playerUids.length !== 2) return;

  const [uid1, uid2] = playerUids;
  const guess1 = guesses[uid1];
  const guess2 = guesses[uid2];

  if (!guess1 || !guess2) return;

  // Calculate damage
  const score1 = guess1.score || 0;
  const score2 = guess2.score || 0;
  const scoreDiff = Math.abs(score1 - score2);
  const multiplier = getDamageMultiplier(currentRound);
  const rawDamage = Math.round(scoreDiff * multiplier);

  // Determine who takes damage
  let damagedPlayer: string | null = null;
  const newHealth: Record<string, number> = { ...health };

  if (score1 < score2) {
    damagedPlayer = uid1;
    newHealth[uid1] = Math.max(0, newHealth[uid1] - rawDamage);
  } else if (score2 < score1) {
    damagedPlayer = uid2;
    newHealth[uid2] = Math.max(0, newHealth[uid2] - rawDamage);
  }
  // If tied, no damage dealt

  // Build round history entry
  const roundEntry: RoundHistoryEntry = {
    roundNumber: currentRound,
    imageUrl: currentImage.url,
    actualLocation: currentImage.correctLocation,
    actualFloor: currentImage.correctFloor ?? null,
    players: {
      [uid1]: {
        location: guess1.location,
        floor: guess1.floor,
        score: score1,
        locationScore: guess1.locationScore || 0,
        distance: guess1.distance,
        floorCorrect: guess1.floorCorrect,
        timedOut: guess1.timedOut || false,
        noGuess: guess1.noGuess || false,
        ...(guess1.timeTakenSeconds !== undefined && { timeTakenSeconds: guess1.timeTakenSeconds }),
        ...(guess1.timePenalty !== undefined && guess1.timePenalty > 0 && { timePenalty: guess1.timePenalty })
      },
      [uid2]: {
        location: guess2.location,
        floor: guess2.floor,
        score: score2,
        locationScore: guess2.locationScore || 0,
        distance: guess2.distance,
        floorCorrect: guess2.floorCorrect,
        timedOut: guess2.timedOut || false,
        noGuess: guess2.noGuess || false,
        ...(guess2.timeTakenSeconds !== undefined && { timeTakenSeconds: guess2.timeTakenSeconds }),
        ...(guess2.timePenalty !== undefined && guess2.timePenalty > 0 && { timePenalty: guess2.timePenalty })
      }
    },
    damage: rawDamage,
    multiplier,
    damagedPlayer,
    healthAfter: { ...newHealth }
  };

  const updatedHistory = [...roundHistory, roundEntry];

  // Check if someone died
  const gameOver = newHealth[uid1] <= 0 || newHealth[uid2] <= 0;

  if (gameOver) {
    const winner = newHealth[uid1] <= 0 ? uid2 : uid1;
    const loser = winner === uid1 ? uid2 : uid1;

    await updateDoc(lobbyRef, {
      health: newHealth,
      roundHistory: updatedHistory,
      phase: 'finished',
      winner,
      loser,
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    // Set phase to results so both players see the round results
    await updateDoc(lobbyRef, {
      health: newHealth,
      roundHistory: updatedHistory,
      phase: 'results',
      updatedAt: serverTimestamp()
    });
  }
}

/**
 * Advance to the next round after viewing results.
 * Loads a new image, resets guesses, increments round.
 * Only the host should call this.
 */
export async function advanceToNextRound(docId: string, difficulty: string): Promise<void> {
  const image = await getRandomImage(difficulty);

  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data() as DuelData;

  await updateDoc(lobbyRef, {
    currentRound: (lobby.currentRound || 1) + 1,
    currentImage: {
      url: image!.url,
      correctLocation: image!.correctLocation || { x: 50, y: 50 },
      correctFloor: image!.correctFloor ?? null,
      difficulty: image!.difficulty || difficulty
    },
    roundStartedAt: Timestamp.now(),
    guesses: {},
    phase: 'guessing',
    updatedAt: serverTimestamp()
  });
}

/**
 * Subscribe to a duel/lobby document for real-time updates.
 */
export function subscribeDuel(
  docId: string,
  callback: (data: DuelData | null) => void
): () => void {
  const lobbyRef = doc(db, 'lobbies', docId);
  return onSnapshot(lobbyRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ docId: snapshot.id, ...snapshot.data() } as DuelData);
    } else {
      callback(null);
    }
  });
}

/**
 * Handle opponent disconnect — award win to remaining player.
 */
export async function handleOpponentDisconnect(
  docId: string,
  winnerUid: string,
  loserUid: string
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data() as DuelData;
  if (lobby.phase === 'finished') return; // Already finished

  const health: Record<string, number> = lobby.health || {};
  health[loserUid] = 0;

  await updateDoc(lobbyRef, {
    health,
    phase: 'finished',
    winner: winnerUid,
    loser: loserUid,
    finishedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
