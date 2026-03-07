import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface GuessCoords {
  x: number;
  y: number;
}

export interface SaveUserGuessPayload {
  imageId: string | null;
  guessLocation: GuessCoords | null;
  guessFloor: number | null;
  actualLocation: GuessCoords;
  actualFloor: number | null;
  distance: number | null;
  score: number;
  roundNumber: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeCoords(coords: GuessCoords | null): GuessCoords | null {
  if (!coords || !Number.isFinite(coords.x) || !Number.isFinite(coords.y)) {
    return null;
  }

  return {
    x: clamp(coords.x, 0, 100),
    y: clamp(coords.y, 0, 100)
  };
}

function getOrCreateClientSessionId(): string {
  const key = 'geoguessrClientSessionId';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const generated = `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return 'session-unavailable';
  }
}

export async function saveUserGuess(payload: SaveUserGuessPayload): Promise<string | null> {
  const imageId = payload.imageId;
  const guessLocation = normalizeCoords(payload.guessLocation);
  if (!imageId || !guessLocation) {
    return null;
  }

  const guessesRef = collection(db, 'guesses');
  const docRef = await addDoc(guessesRef, {
    imageId,
    guessLocation,
    guessFloor: payload.guessFloor ?? null,
    actualLocation: normalizeCoords(payload.actualLocation),
    actualFloor: payload.actualFloor ?? null,
    distance: Number.isFinite(payload.distance) ? payload.distance : null,
    score: Number.isFinite(payload.score) ? payload.score : null,
    roundNumber: Number.isFinite(payload.roundNumber) ? payload.roundNumber : null,
    source: 'game-client',
    clientSessionId: getOrCreateClientSessionId(),
    createdAt: serverTimestamp(),
    createdAtMs: Date.now()
  });

  return docRef.id;
}

