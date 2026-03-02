import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface TouchLastActiveOptions {
  /**
   * Minimum time between writes for the same user.
   * Used to avoid spamming the database.
   */
  minIntervalMs?: number;
  /** Skip throttling (use sparingly). */
  force?: boolean;
}

const DEFAULT_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOCAL_STORAGE_PREFIX = 'users.lastActive.lastWriteAtMs.v1';
const memoryLastWriteAtMs: Record<string, number> = {};

function storageKey(uid: string): string {
  return `${LOCAL_STORAGE_PREFIX}.${uid}`;
}

function getLastWriteAtMs(uid: string): number {
  const mem = memoryLastWriteAtMs[uid] ?? 0;
  let persisted = 0;
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    persisted = raw ? Number(raw) : 0;
  } catch {
    persisted = 0;
  }
  return Math.max(mem, persisted || 0);
}

function setLastWriteAtMs(uid: string, ms: number): void {
  memoryLastWriteAtMs[uid] = ms;
  try {
    window.localStorage.setItem(storageKey(uid), String(ms));
  } catch {
    // Ignore localStorage failures (private mode, quota, etc.)
  }
}

/**
 * Update `users/{uid}.lastActive` using Firestore server time.
 * Returns true if a write was attempted (not necessarily persisted).
 */
export async function touchLastActive(uid: string | null | undefined, options: TouchLastActiveOptions = {}): Promise<boolean> {
  if (!uid) return false;

  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const nowMs = Date.now();

  if (!options.force) {
    const lastWriteAtMs = getLastWriteAtMs(uid);
    if (lastWriteAtMs && nowMs - lastWriteAtMs < minIntervalMs) {
      return false;
    }
  }

  // Set locally first to prevent repeated rapid attempts (even if offline).
  setLastWriteAtMs(uid, nowMs);

  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { lastActive: serverTimestamp() });
    return true;
  } catch {
    // User doc may not exist yet (e.g. new Google sign-in before username pick).
    return true;
  }
}

