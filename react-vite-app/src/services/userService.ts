import {
  doc,
  getDoc,
  updateDoc,
  query,
  collection,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  runTransaction,
  documentId,
} from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

// This user is ALWAYS an admin, regardless of their Firestore isAdmin field
const HARDCODED_ADMIN_UID = 'bL0Ww9dSPbeDAGSDVlhljYMnqfE3';
const USERNAMES_COLLECTION = 'usernames';
const USERNAME_TAKEN_CODE = 'USERNAME_TAKEN';

export type AdminPermissionKey =
  | 'reviewSubmissions'
  | 'deletePhotos'
  | 'editMap'
  | 'viewAccounts'
  | 'editAccounts'
  | 'messageAccounts'
  | 'manageAdmins'
  | 'manageFriendsChats'
  | 'manageBugReports';

export type PermissionsMap = Record<AdminPermissionKey, boolean>;

export interface UserDoc {
  uid: string;
  email: string;
  username: string;
  isAdmin: boolean;
  emailVerified: boolean;
  totalXp: number;
  gamesPlayed: number;
  createdAt: unknown;
  permissions?: PermissionsMap;
  lastGameAt?: unknown;
}

export interface UserDocWithId extends UserDoc {
  id: string;
}

export interface UserProfileUpdates {
  username?: string;
  email?: string;
  isAdmin?: boolean;
  emailVerified?: boolean;
  totalXp?: number;
  gamesPlayed?: number;
  lastGameAt?: Date | string | null;
  [key: string]: unknown;
}

export type UsernameSuggestions = string[];

export class UsernameTakenError extends Error {
  suggestions: UsernameSuggestions;
  constructor(suggestions: UsernameSuggestions) {
    super('This username is taken. Try one of these instead:');
    this.name = 'UsernameTakenError';
    this.suggestions = suggestions;
  }
}

// ────── Constants ──────

/**
 * All available admin permissions.
 * Each key is stored as a boolean in the user's `permissions` map in Firestore.
 */
export const ADMIN_PERMISSIONS = {
  REVIEW_SUBMISSIONS: 'reviewSubmissions' as const,
  DELETE_PHOTOS: 'deletePhotos' as const,
  EDIT_MAP: 'editMap' as const,
  VIEW_ACCOUNTS: 'viewAccounts' as const,
  EDIT_ACCOUNTS: 'editAccounts' as const,
  MESSAGE_ACCOUNTS: 'messageAccounts' as const,
  MANAGE_ADMINS: 'manageAdmins' as const,
  MANAGE_FRIENDS_CHATS: 'manageFriendsChats' as const,
  MANAGE_BUG_REPORTS: 'manageBugReports' as const,
} as const;

/**
 * Human-readable labels for each permission (used in UI)
 */
export const PERMISSION_LABELS: Record<AdminPermissionKey, string> = {
  [ADMIN_PERMISSIONS.REVIEW_SUBMISSIONS]: 'Review Submissions',
  [ADMIN_PERMISSIONS.DELETE_PHOTOS]: 'Delete Photos',
  [ADMIN_PERMISSIONS.EDIT_MAP]: 'Edit Map',
  [ADMIN_PERMISSIONS.VIEW_ACCOUNTS]: 'View Accounts',
  [ADMIN_PERMISSIONS.EDIT_ACCOUNTS]: 'Edit Accounts',
  [ADMIN_PERMISSIONS.MESSAGE_ACCOUNTS]: 'Message Accounts',
  [ADMIN_PERMISSIONS.MANAGE_ADMINS]: 'Manage Admins & Permissions',
  [ADMIN_PERMISSIONS.MANAGE_FRIENDS_CHATS]: 'Manage Friends & Chats',
  [ADMIN_PERMISSIONS.MANAGE_BUG_REPORTS]: 'Manage Bug Reports',
};

// ────── Username helpers ──────

/**
 * Normalize a username into a canonical key used for uniqueness checks.
 * This enforces case-insensitive uniqueness and avoids problematic characters in doc IDs.
 */
export function normalizeUsernameKey(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sanitizeUsernameForDisplay(username: string): string {
  const trimmed = username.trim();
  const cleaned = trimmed
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'player';
}

function randomAlphaNum(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function getTakenUsernameKeys(keys: string[]): Promise<Set<string>> {
  const uniqueKeys = Array.from(new Set(keys)).filter(Boolean).slice(0, 10);
  if (uniqueKeys.length === 0) return new Set();
  const usernamesRef = collection(db, USERNAMES_COLLECTION);
  const q = query(usernamesRef, where(documentId(), 'in', uniqueKeys));
  const snapshot = await getDocs(q);
  return new Set(snapshot.docs.map(d => d.id));
}

async function queryUsersByUsernameKeyOrExact(username: string, key: string) {
  const usersRef = collection(db, 'users');
  const trimmed = username.trim();

  // Prefer the canonical key field when present
  const byKey = query(usersRef, where('usernameKey', '==', key));
  const keySnap = await getDocs(byKey);
  if (!keySnap.empty) return keySnap;

  // Backward-compat: older users may not have usernameKey
  const byExact = query(usersRef, where('username', '==', trimmed));
  return await getDocs(byExact);
}

export async function generateUniqueUsernameSuggestions(
  desiredUsername: string,
  count = 3
): Promise<UsernameSuggestions> {
  const base = sanitizeUsernameForDisplay(desiredUsername);
  const baseKey = normalizeUsernameKey(base);

  const wordSuffixes = ['dev', 'gg', 'pro', 'play', 'hw'];

  const candidates: string[] = [];
  // A few deterministic formats first
  candidates.push(`${base}123`);
  candidates.push(`${base}_01`);
  candidates.push(`${base}_x7`);
  candidates.push(`${base}_dev`);
  candidates.push(`${base}9a`);

  // Then a wider pool with light randomness
  for (let i = 1; i <= 30; i++) {
    candidates.push(`${base}${i}`);
    candidates.push(`${base}_${String(i).padStart(2, '0')}`);
  }
  for (let i = 0; i < 20; i++) {
    candidates.push(`${base}_${randomAlphaNum(2)}`);
    candidates.push(`${base}${randomAlphaNum(2)}`);
    candidates.push(`${base}_${wordSuffixes[i % wordSuffixes.length]}`);
  }

  const suggestions: string[] = [];
  const seenKeys = new Set<string>([baseKey]);

  // Check in small batches (Firestore 'in' supports up to 10)
  const pendingKeys: { key: string; display: string }[] = [];
  for (const display of candidates) {
    const key = normalizeUsernameKey(display);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    pendingKeys.push({ key, display });
  }

  let idx = 0;
  while (suggestions.length < count && idx < pendingKeys.length) {
    const batch = pendingKeys.slice(idx, idx + 10);
    idx += 10;
    const taken = await getTakenUsernameKeys(batch.map(b => b.key));
    for (const c of batch) {
      if (!taken.has(c.key)) {
        suggestions.push(c.display);
        if (suggestions.length >= count) break;
      }
    }
  }

  // If somehow still short (very high collisions), fall back to longer random strings.
  while (suggestions.length < count) {
    const display = `${base}_${randomAlphaNum(4)}`;
    const key = normalizeUsernameKey(display);
    if (!key || seenKeys.has(key)) continue;
    const taken = await getTakenUsernameKeys([key]);
    if (!taken.has(key)) suggestions.push(display);
  }

  return suggestions.slice(0, count);
}

/**
 * Fast availability check against the usernames registry.
 * If suggestions=true and the name is taken, returns 3 unique suggestions.
 */
export async function checkUsernameAvailability(
  username: string,
  excludeUid: string | null = null,
  suggestions = false
): Promise<{ available: boolean; suggestions?: UsernameSuggestions }> {
  const key = normalizeUsernameKey(username);
  if (!key) return { available: false, suggestions: suggestions ? await generateUniqueUsernameSuggestions(username) : undefined };

  const usernameRef = doc(db, USERNAMES_COLLECTION, key);
  const snap = await getDoc(usernameRef);
  if (!snap.exists()) {
    // Backward-compat: if some users exist without a reservation doc, treat as taken.
    const usersSnap = await queryUsersByUsernameKeyOrExact(username, key);
    if (usersSnap.empty) return { available: true };
    if (excludeUid) {
      const takenByOther = usersSnap.docs.some(d => d.id !== excludeUid);
      if (!takenByOther) return { available: true };
    }
    return suggestions
      ? { available: false, suggestions: await generateUniqueUsernameSuggestions(username) }
      : { available: false };
  }

  const data = snap.data() as { uid?: string } | undefined;
  const isTakenByOther = !excludeUid || (data?.uid && data.uid !== excludeUid);
  if (!isTakenByOther) return { available: true };

  if (!suggestions) return { available: false };
  return { available: false, suggestions: await generateUniqueUsernameSuggestions(username) };
}

// ────── Permission Helpers ──────

/**
 * Returns a permissions object with ALL permissions set to true.
 * Used for the hardcoded admin and as a convenience for granting full access.
 */
export function getAllPermissions(): PermissionsMap {
  return Object.fromEntries(
    Object.values(ADMIN_PERMISSIONS).map(p => [p, true])
  ) as PermissionsMap;
}

/**
 * Returns a permissions object with ALL permissions set to false.
 */
export function getNoPermissions(): PermissionsMap {
  return Object.fromEntries(
    Object.values(ADMIN_PERMISSIONS).map(p => [p, false])
  ) as PermissionsMap;
}

// ────── User CRUD ──────

/**
 * Create a new user document in Firestore
 */
export async function createUserDoc(uid: string, email: string, username: string): Promise<void> {
  const trimmed = username.trim();
  const key = normalizeUsernameKey(trimmed);
  if (!key) {
    throw new Error('Username cannot be empty.');
  }

  const userRef = doc(db, 'users', uid);
  const usernameRef = doc(db, USERNAMES_COLLECTION, key);

  const isAdmin = uid === HARDCODED_ADMIN_UID;

  try {
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(usernameRef);
      if (existing.exists()) {
        throw new Error(USERNAME_TAKEN_CODE);
      }

      tx.set(usernameRef, {
        uid,
        username: trimmed,
        usernameKey: key,
        createdAt: serverTimestamp()
      });

      const userData: Record<string, unknown> = {
        uid,
        email,
        emailLower: email.toLowerCase(),
        username: trimmed,
        usernameKey: key,
        isAdmin,
        emailVerified: false,
        totalXp: 0,
        gamesPlayed: 0,
        createdAt: serverTimestamp()
      };
      if (isAdmin) userData.permissions = getAllPermissions();
      tx.set(userRef, userData);
    });
  } catch (err) {
    if (err instanceof Error && err.message === USERNAME_TAKEN_CODE) {
      throw new UsernameTakenError(await generateUniqueUsernameSuggestions(trimmed));
    }
    throw err;
  }
}

/**
 * Get a user document from Firestore
 * Returns null if the user doesn't exist
 */
export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) {
    const data = snapshot.data() as UserDoc;
    // Hardcoded admin is ALWAYS an admin with ALL permissions
    if (uid === HARDCODED_ADMIN_UID) {
      data.isAdmin = true;
      data.permissions = getAllPermissions();
    }
    return data;
  }
  return null;
}

/**
 * Update a user document in Firestore
 */
export async function updateUserDoc(uid: string, data: Record<string, unknown>): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, data);
}

/**
 * Check if a username is already taken by another user
 * Optionally exclude a specific uid (for the current user editing their own username)
 */
export async function isUsernameTaken(username: string, excludeUid: string | null = null): Promise<boolean> {
  const key = normalizeUsernameKey(username);
  if (!key) return true;

  const usernameRef = doc(db, USERNAMES_COLLECTION, key);
  const snap = await getDoc(usernameRef);
  if (snap.exists()) {
    const data = snap.data() as { uid?: string } | undefined;
    if (!excludeUid) return true;
    return !!(data?.uid && data.uid !== excludeUid);
  }

  // Backward-compat fallback (older users without a usernameKey/reservation)
  const snapshot = await queryUsersByUsernameKeyOrExact(username, key);
  if (snapshot.empty) return false;
  if (excludeUid) return snapshot.docs.some(docSnap => docSnap.id !== excludeUid);
  return true;
}

/**
 * Best-effort migration helper: ensures the current user's username has a reservation doc
 * and that their user doc has a `usernameKey` field.
 */
export async function ensureUsernameReservation(uid: string, username: string): Promise<void> {
  const trimmed = username.trim();
  const key = normalizeUsernameKey(trimmed);
  if (!key) return;

  const userRef = doc(db, 'users', uid);
  const usernameRef = doc(db, USERNAMES_COLLECTION, key);

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return;

    const existing = await tx.get(usernameRef);
    if (existing.exists()) {
      const existingUid = (existing.data() as { uid?: string } | undefined)?.uid;
      if (existingUid && existingUid !== uid) return;
    } else {
      tx.set(usernameRef, { uid, username: trimmed, usernameKey: key, createdAt: serverTimestamp() });
    }

    const userData = userSnap.data() as { usernameKey?: string };
    if (!userData.usernameKey) {
      tx.update(userRef, { usernameKey: key });
    }
  });
}

/**
 * Atomically update a user's username while preserving uniqueness.
 * Creates a reservation for the new username key and releases the old one.
 */
export async function updateUsernameUnique(uid: string, newUsername: string): Promise<void> {
  const trimmed = newUsername.trim();
  const newKey = normalizeUsernameKey(trimmed);
  if (!newKey) throw new Error('Username cannot be empty.');

  // Prevent duplicates with legacy users lacking a reservation doc.
  if (await isUsernameTaken(trimmed, uid)) {
    throw new UsernameTakenError(await generateUniqueUsernameSuggestions(trimmed));
  }

  const userRef = doc(db, 'users', uid);
  const newUsernameRef = doc(db, USERNAMES_COLLECTION, newKey);

  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error('User record not found.');

      const userData = userSnap.data() as { username?: string; usernameKey?: string };
      const oldKey = (userData.usernameKey && typeof userData.usernameKey === 'string')
        ? userData.usernameKey
        : normalizeUsernameKey(userData.username || '');

      if (oldKey === newKey) {
        tx.update(userRef, { username: trimmed, usernameKey: newKey });
        return;
      }

      const existing = await tx.get(newUsernameRef);
      if (existing.exists()) {
        const existingUid = (existing.data() as { uid?: string } | undefined)?.uid;
        if (existingUid && existingUid !== uid) {
          throw new Error(USERNAME_TAKEN_CODE);
        }
      } else {
        tx.set(newUsernameRef, {
          uid,
          username: trimmed,
          usernameKey: newKey,
          createdAt: serverTimestamp()
        });
      }

      if (oldKey) {
        const oldRef = doc(db, USERNAMES_COLLECTION, oldKey);
        const oldSnap = await tx.get(oldRef);
        const oldUid = (oldSnap.data() as { uid?: string } | undefined)?.uid;
        if (oldSnap.exists() && oldUid === uid) {
          tx.delete(oldRef);
        }
      }

      tx.update(userRef, { username: trimmed, usernameKey: newKey });
    });
  } catch (err) {
    if (err instanceof Error && err.message === USERNAME_TAKEN_CODE) {
      throw new UsernameTakenError(await generateUniqueUsernameSuggestions(trimmed));
    }
    throw err;
  }
}

/**
 * Check if a user is the hardcoded admin (always admin regardless of DB)
 */
export function isHardcodedAdmin(uid: string): boolean {
  return uid === HARDCODED_ADMIN_UID;
}

/**
 * Get all user documents from Firestore
 * Used by admins to manage accounts
 */
export async function getAllUsers(): Promise<UserDocWithId[]> {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data() as UserDoc;
    // Hardcoded admin is ALWAYS an admin with ALL permissions
    if (docSnap.id === HARDCODED_ADMIN_UID) {
      data.isAdmin = true;
      data.permissions = getAllPermissions();
    }
    return { id: docSnap.id, ...data };
  });
}

/**
 * Set the admin status for a user
 * Cannot remove admin from the hardcoded admin user
 */
export async function setUserAdmin(uid: string, isAdmin: boolean): Promise<void> {
  // Prevent removing admin from the hardcoded admin
  if (uid === HARDCODED_ADMIN_UID && !isAdmin) {
    throw new Error('Cannot remove admin status from this user.');
  }
  const userRef = doc(db, 'users', uid);
  const updates: Record<string, unknown> = { isAdmin };
  // When granting admin, give all permissions by default
  // When revoking admin, clear all permissions
  updates.permissions = isAdmin ? getAllPermissions() : getNoPermissions();
  await updateDoc(userRef, updates);
}

/**
 * Update a specific admin user's permissions map.
 * Cannot modify hardcoded admin's permissions.
 */
export async function updateUserPermissions(uid: string, permissions: PermissionsMap): Promise<void> {
  if (uid === HARDCODED_ADMIN_UID) {
    throw new Error('Cannot modify permissions for this user.');
  }
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { permissions });
}

/**
 * Update a user's profile fields (admin operation)
 * Validates username uniqueness, protects hardcoded admin status,
 * and prevents modification of system fields (uid, createdAt).
 */
export async function updateUserProfile(uid: string, updates: UserProfileUpdates): Promise<void> {
  // Prevent changing system-managed fields
  const forbidden = ['uid', 'createdAt', 'permissions'];
  for (const key of forbidden) {
    if (key in updates) {
      throw new Error(`Cannot modify the "${key}" field.`);
    }
  }

  // Protect hardcoded admin's isAdmin status
  if (uid === HARDCODED_ADMIN_UID && 'isAdmin' in updates && !updates.isAdmin) {
    throw new Error('Cannot remove admin status from this user.');
  }

  // Validate username if being changed
  if ('username' in updates) {
    const trimmed = (updates.username as string).trim();
    if (!trimmed) {
      throw new Error('Username cannot be empty.');
    }
    if (trimmed.length < 3) {
      throw new Error('Username must be at least 3 characters.');
    }
    updates.username = trimmed;
  }

  // Validate totalXp if being changed
  if ('totalXp' in updates) {
    const xp = Number(updates.totalXp);
    if (isNaN(xp) || xp < 0) {
      throw new Error('Total XP must be a non-negative number.');
    }
    updates.totalXp = xp;
  }

  // Validate gamesPlayed if being changed
  if ('gamesPlayed' in updates) {
    const gp = Number(updates.gamesPlayed);
    if (isNaN(gp) || gp < 0 || !Number.isInteger(gp)) {
      throw new Error('Games played must be a non-negative whole number.');
    }
    updates.gamesPlayed = gp;
  }

  // Convert lastGameAt to a Firestore-compatible Date if provided
  if ('lastGameAt' in updates && updates.lastGameAt !== null) {
    const date = updates.lastGameAt instanceof Date ? updates.lastGameAt : new Date(updates.lastGameAt as string);
    if (isNaN(date.getTime())) {
      throw new Error('Last game date is invalid.');
    }
    updates.lastGameAt = date;
  }

  // Keep emailLower in sync when email is updated
  if ('email' in updates && typeof updates.email === 'string') {
    updates.emailLower = updates.email.toLowerCase();
  }

  // If username is changing, update via reservation-aware transaction
  if ('username' in updates) {
    const desired = updates.username as string;
    const newKey = normalizeUsernameKey(desired);
    if (!newKey) throw new Error('Username cannot be empty.');

    // Prevent duplicates with legacy users lacking a reservation doc.
    if (await isUsernameTaken(desired, uid)) {
      throw new UsernameTakenError(await generateUniqueUsernameSuggestions(desired));
    }

    const userRef = doc(db, 'users', uid);
    const newUsernameRef = doc(db, USERNAMES_COLLECTION, newKey);

    try {
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('User record not found.');

        const userData = userSnap.data() as { username?: string; usernameKey?: string };
        const oldKey = (userData.usernameKey && typeof userData.usernameKey === 'string')
          ? userData.usernameKey
          : normalizeUsernameKey(userData.username || '');

        if (oldKey !== newKey) {
          const existing = await tx.get(newUsernameRef);
          if (existing.exists()) {
            const existingUid = (existing.data() as { uid?: string } | undefined)?.uid;
            if (existingUid && existingUid !== uid) {
              throw new Error(USERNAME_TAKEN_CODE);
            }
          } else {
            tx.set(newUsernameRef, {
              uid,
              username: desired,
              usernameKey: newKey,
              createdAt: serverTimestamp()
            });
          }

          if (oldKey) {
            const oldRef = doc(db, USERNAMES_COLLECTION, oldKey);
            const oldSnap = await tx.get(oldRef);
            const oldUid = (oldSnap.data() as { uid?: string } | undefined)?.uid;
            if (oldSnap.exists() && oldUid === uid) tx.delete(oldRef);
          }
        }

        const patch: Record<string, unknown> = { ...updates, usernameKey: newKey };
        tx.update(userRef, patch);
      });
    } catch (err) {
      if (err instanceof Error && err.message === USERNAME_TAKEN_CODE) {
        throw new UsernameTakenError(await generateUniqueUsernameSuggestions(desired));
      }
      throw err;
    }
    return;
  }

  await updateUserDoc(uid, updates as Record<string, unknown>);
}
