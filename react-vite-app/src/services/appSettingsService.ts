import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

export interface AppSettings {
  tournamentMode: boolean;
  updatedAt: unknown;
  updatedBy: string | null;
}

const APP_SETTINGS_DOC_ID = 'global';
const APP_SETTINGS_COLLECTION = 'appSettings';

// ────── Cache ──────

let cachedSettings: AppSettings | null = null;
let cacheExpiresAtMs = 0;
const CACHE_TTL_MS = 30_000;

// ────── Functions ──────

/**
 * Fetch the global app settings document.
 * Returns default settings if the document doesn't exist.
 */
export async function getAppSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (cachedSettings && cacheExpiresAtMs > now) {
    return cachedSettings;
  }

  const settingsRef = doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID);
  const snapshot = await getDoc(settingsRef);

  if (snapshot.exists()) {
    const data = snapshot.data();
    const settings: AppSettings = {
      tournamentMode: typeof data.tournamentMode === 'boolean' ? data.tournamentMode : false,
      updatedAt: data.updatedAt ?? null,
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null
    };
    cachedSettings = settings;
    cacheExpiresAtMs = now + CACHE_TTL_MS;
    return settings;
  }

  // Return defaults if doc doesn't exist
  const defaults: AppSettings = {
    tournamentMode: false,
    updatedAt: null,
    updatedBy: null
  };
  cachedSettings = defaults;
  cacheExpiresAtMs = now + CACHE_TTL_MS;
  return defaults;
}

/**
 * Set the tournament mode state.
 * @param enabled - true to enable tournament mode, false to disable
 * @param adminUid - UID of the admin making the change
 */
export async function setTournamentMode(enabled: boolean, adminUid: string): Promise<void> {
  const settingsRef = doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID);
  await setDoc(settingsRef, {
    tournamentMode: enabled,
    updatedAt: serverTimestamp(),
    updatedBy: adminUid
  }, { merge: true });

  // Invalidate cache
  cachedSettings = null;
  cacheExpiresAtMs = 0;
}

/**
 * Subscribe to real-time updates of the tournament mode setting.
 * @param callback - Called with the current tournament mode state whenever it changes
 * @returns Unsubscribe function to stop listening
 */
export function subscribeTournamentMode(callback: (enabled: boolean) => void): Unsubscribe {
  const settingsRef = doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID);

  return onSnapshot(settingsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      const enabled = typeof data.tournamentMode === 'boolean' ? data.tournamentMode : false;
      cachedSettings = {
        tournamentMode: enabled,
        updatedAt: data.updatedAt ?? null,
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null
      };
      cacheExpiresAtMs = Date.now() + CACHE_TTL_MS;
      callback(enabled);
    } else {
      cachedSettings = {
        tournamentMode: false,
        updatedAt: null,
        updatedBy: null
      };
      cacheExpiresAtMs = Date.now() + CACHE_TTL_MS;
      callback(false);
    }
  }, (error) => {
    console.error('Error subscribing to tournament mode:', error);
    callback(false);
  });
}

/**
 * Convenience function to check if tournament mode is currently enabled.
 * Uses cached value if available, otherwise fetches from Firestore.
 */
export async function isTournamentModeEnabled(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.tournamentMode;
}
