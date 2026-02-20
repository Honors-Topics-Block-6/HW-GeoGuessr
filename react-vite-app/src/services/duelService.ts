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
import { getRegions, getRegionForPoint } from './regionService';

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
  id?: string;
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
}

export interface RoundHistoryEntry {
  roundNumber: number;
  imageId?: string;
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
  forfeitBy?: string | null;
  finishedAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  players: DuelPlayer[];
  difficulty: string;
  /** Round time in seconds. 0 = no time limit. Falls back to DUEL_ROUND_TIME_SECONDS if absent. */
  roundTimeSeconds?: number;
}

// ────── Constants ──────

/** Starting health for each player */
export const STARTING_HEALTH = 6000;

/** Round time in seconds */
export const DUEL_ROUND_TIME_SECONDS = 20;

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
  if (!image) {
    throw new Error('No approved images are available to start a duel.');
  }

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
      id: image.id,
      url: image.url,
      correctLocation: image.correctLocation || { x: 50, y: 50 },
      correctFloor: image.correctFloor ?? null,
      difficulty: image.difficulty || difficulty
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

/**
 * Submit a player's guess for the current round.
 * Calculates score client-side using the same formula as singleplayer.
 */
export async function submitDuelGuess(
  docId: string,
  playerUid: string,
  guessData: GuessData,
  currentImage: DuelImage
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
    const regions = await getRegions();
    const guessedRegion = getRegionForPoint(guessData.location, regions);
    const actualRegion = getRegionForPoint(actualLocation, regions);
    const isCorrectBuilding = guessedRegion !== null && actualRegion !== null && guessedRegion.id === actualRegion.id;

    // Floor scoring logic (same as singleplayer):
    // floor only counts if both building and floor are correct.
    if (guessData.floor !== null && guessData.floor !== undefined && actualFloor !== null) {
      floorCorrect = isCorrectBuilding && guessData.floor === actualFloor;
      score = floorCorrect ? locationScore : Math.round(locationScore * 0.8);
    } else {
      score = locationScore;
    }
  }

  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    [`guesses.${playerUid}`]: {
      location: guessData.location,
      floor: guessData.floor ?? null,
      score,
      locationScore,
      distance,
      floorCorrect,
      timedOut: guessData.timedOut || false,
      noGuess: guessData.noGuess || false,
      submittedAt: Timestamp.now()
    },
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

  const allUids = players.map(p => p.uid);
  if (allUids.length < 2) return;

  const currentHealth: Record<string, number> = { ...health };
  for (const uid of allUids) {
    if (typeof currentHealth[uid] !== 'number') {
      currentHealth[uid] = STARTING_HEALTH;
    }
  }

  // Only require guesses from players who are still alive.
  const activeUids = allUids.filter(uid => (currentHealth[uid] ?? 0) > 0);
  if (activeUids.length < 2) return;

  const missingGuess = activeUids.some(uid => !guesses?.[uid]);
  if (missingGuess) return;

  const multiplier = getDamageMultiplier(currentRound);

  // Determine best and worst scores among active players.
  const scored = activeUids.map(uid => ({
    uid,
    score: guesses[uid]?.score ?? 0
  })).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score; // desc
    return a.uid.localeCompare(b.uid); // deterministic tie-breaker
  });

  const best = scored[0];
  const worst = scored[scored.length - 1];

  const scoreDiff = Math.max(0, (best?.score ?? 0) - (worst?.score ?? 0));
  const rawDamage = Math.round(scoreDiff * multiplier);

  let damagedPlayer: string | null = null;
  const newHealth: Record<string, number> = { ...currentHealth };

  if (rawDamage > 0 && worst?.uid) {
    damagedPlayer = worst.uid;
    newHealth[damagedPlayer] = Math.max(0, (newHealth[damagedPlayer] ?? STARTING_HEALTH) - rawDamage);
  }

  // Build round history entry
  const roundEntry: RoundHistoryEntry = {
    roundNumber: currentRound,
    imageId: currentImage.id,
    imageUrl: currentImage.url,
    actualLocation: currentImage.correctLocation,
    actualFloor: currentImage.correctFloor ?? null,
    players: Object.fromEntries(activeUids.map((uid) => {
      const g = guesses[uid];
      return [uid, {
        location: g?.location ?? null,
        floor: g?.floor ?? null,
        score: g?.score ?? 0,
        locationScore: g?.locationScore ?? 0,
        distance: g?.distance ?? null,
        floorCorrect: g?.floorCorrect ?? null,
        timedOut: g?.timedOut ?? false,
        noGuess: g?.noGuess ?? false
      }];
    })),
    damage: rawDamage,
    multiplier,
    damagedPlayer,
    healthAfter: { ...newHealth }
  };

  const updatedHistory = [...roundHistory, roundEntry];

  const aliveUids = activeUids.filter(uid => (newHealth[uid] ?? 0) > 0);
  const gameOver = aliveUids.length <= 1;

  if (gameOver) {
    const winner = aliveUids[0] ?? best.uid;
    const loser = damagedPlayer ?? worst.uid;

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
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data() as DuelData;
  const usedImageIds: string[] = [];
  const usedImageUrls: string[] = [];

  if (lobby.currentImage?.id) {
    usedImageIds.push(lobby.currentImage.id);
  }
  if (lobby.currentImage?.url) {
    usedImageUrls.push(lobby.currentImage.url);
  }
  (lobby.roundHistory || []).forEach((entry) => {
    if (entry.imageId) usedImageIds.push(entry.imageId);
    if (entry.imageUrl) usedImageUrls.push(entry.imageUrl);
  });

  let image = await getRandomImage(difficulty, {
    excludeImageIds: usedImageIds,
    excludeImageUrls: usedImageUrls
  });
  // If all images have already been seen in this duel, fall back to full pool
  // so the match can continue instead of getting stuck.
  if (!image) {
    image = await getRandomImage(difficulty);
  }
  if (!image) {
    throw new Error('No approved images are available to continue this duel.');
  }

  await updateDoc(lobbyRef, {
    currentRound: (lobby.currentRound || 1) + 1,
    currentImage: {
      id: image.id,
      url: image.url,
      correctLocation: image.correctLocation || { x: 50, y: 50 },
      correctFloor: image.correctFloor ?? null,
      difficulty: image.difficulty || difficulty
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
 * When forfeitBy is provided, records that the loser voluntarily forfeited.
 */
export async function handleOpponentDisconnect(
  docId: string,
  winnerUid: string,
  loserUid: string,
  forfeitBy?: string
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data() as DuelData;
  if (lobby.phase === 'finished') return; // Already finished

  const health: Record<string, number> = lobby.health || {};
  health[loserUid] = 0;

  const updateData: Record<string, unknown> = {
    health,
    phase: 'finished',
    winner: winnerUid,
    loser: loserUid,
    finishedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (forfeitBy != null) {
    updateData.forfeitBy = forfeitBy;
  }

  await updateDoc(lobbyRef, updateData);
}
