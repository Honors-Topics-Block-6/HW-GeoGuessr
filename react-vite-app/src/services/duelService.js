import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { getRandomImage } from './imageService';
import { calculateDistance, calculateLocationScore } from '../hooks/useGameState';

/** Starting health for each player */
export const STARTING_HEALTH = 6000;

/** Round time in seconds */
export const DUEL_ROUND_TIME_SECONDS = 20;

/**
 * Get the damage multiplier for a given round number.
 * Escalates as rounds progress (GeoGuessr Duels style).
 *   Rounds 1-2: 1.0x
 *   Rounds 3-4: 1.5x
 *   Rounds 5+:  2.0x
 */
export function getDamageMultiplier(roundNumber) {
  if (roundNumber <= 2) return 1.0;
  if (roundNumber <= 4) return 1.5;
  return 2.0;
}

/**
 * Start a duel game from the lobby.
 * Called by the host when both players are in the waiting room.
 * Loads the first image, initialises health, and sets phase to 'guessing'.
 *
 * @param {string} docId - Firestore document ID of the lobby
 * @param {Array} players - Array of { uid, username } from the lobby
 * @param {string} difficulty - Difficulty filter for images
 */
export async function startDuel(docId, players, difficulty) {
  const image = await getRandomImage(difficulty);

  const health = {};
  players.forEach(p => {
    health[p.uid] = STARTING_HEALTH;
  });

  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    status: 'in_progress',
    phase: 'guessing',
    currentRound: 1,
    currentImage: {
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
 *
 * @param {string} docId - Lobby document ID
 * @param {string} playerUid - Player's UID
 * @param {object} guessData - { location: {x,y}|null, floor: number|null, timedOut: bool, noGuess: bool }
 * @param {object} currentImage - The current image data with correctLocation/correctFloor
 */
export async function submitDuelGuess(docId, playerUid, guessData, currentImage) {
  let score = 0;
  let locationScore = 0;
  let distance = null;
  let floorCorrect = null;

  if (guessData.location && !guessData.noGuess) {
    const actualLocation = currentImage.correctLocation || { x: 50, y: 50 };
    distance = calculateDistance(guessData.location, actualLocation);
    locationScore = calculateLocationScore(distance);

    const actualFloor = currentImage.correctFloor ?? null;

    // Floor scoring logic (same as singleplayer)
    if (guessData.floor !== null && actualFloor !== null) {
      floorCorrect = guessData.floor === actualFloor;
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
 *
 * @param {string} docId - Lobby document ID
 */
export async function processRound(docId) {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data();
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
  let damagedPlayer = null;
  const newHealth = { ...health };

  if (score1 < score2) {
    damagedPlayer = uid1;
    newHealth[uid1] = Math.max(0, newHealth[uid1] - rawDamage);
  } else if (score2 < score1) {
    damagedPlayer = uid2;
    newHealth[uid2] = Math.max(0, newHealth[uid2] - rawDamage);
  }
  // If tied, no damage dealt

  // Build round history entry
  const roundEntry = {
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
        noGuess: guess1.noGuess || false
      },
      [uid2]: {
        location: guess2.location,
        floor: guess2.floor,
        score: score2,
        locationScore: guess2.locationScore || 0,
        distance: guess2.distance,
        floorCorrect: guess2.floorCorrect,
        timedOut: guess2.timedOut || false,
        noGuess: guess2.noGuess || false
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
 *
 * @param {string} docId - Lobby document ID
 * @param {string} difficulty - Difficulty for image selection
 */
export async function advanceToNextRound(docId, difficulty) {
  const image = await getRandomImage(difficulty);

  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data();

  await updateDoc(lobbyRef, {
    currentRound: (lobby.currentRound || 1) + 1,
    currentImage: {
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
 * @param {string} docId - Firestore document ID
 * @param {function} callback - Called with duel data on each update
 * @returns {function} Unsubscribe function
 */
export function subscribeDuel(docId, callback) {
  const lobbyRef = doc(db, 'lobbies', docId);
  return onSnapshot(lobbyRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ docId: snapshot.id, ...snapshot.data() });
    } else {
      callback(null);
    }
  });
}

/**
 * Handle opponent disconnect — award win to remaining player.
 * @param {string} docId - Lobby document ID
 * @param {string} winnerUid - The remaining player's UID
 * @param {string} loserUid - The disconnected player's UID
 */
export async function handleOpponentDisconnect(docId, winnerUid, loserUid) {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);
  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data();
  if (lobby.phase === 'finished') return; // Already finished

  const health = lobby.health || {};
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
