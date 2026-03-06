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
  favoriteEmote?: string;
  photoURL?: string;
  isAdmin: boolean;
  emailVerified: boolean;
  totalXp: number;
  gamesPlayed: number;
  createdAt: unknown;
  lastActive?: unknown;
  permissions?: PermissionsMap;
  lastGameAt?: unknown;
  totalScore?: number;
  totalGuessTimeSeconds?: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount?: number;
  twentyFiveKCount?: number;
  photosSubmittedCount?: number;
  followersCount?: number;
  buildingStats?: Record<string, BuildingStat>;
  lastOnline?: unknown;
  dailyStats?: Record<string, DailyStatBucket>;
  dailyStatsByDifficulty?: Record<string, Record<string, DailyStatBucket>>;
  lastUsernameChange?: unknown;
}

export interface UserDocWithId extends UserDoc {
  id: string;
}

export interface UserProfileUpdates {
  username?: string;
  favoriteEmote?: string;
  email?: string;
  isAdmin?: boolean;
  emailVerified?: boolean;
  totalXp?: number;
  gamesPlayed?: number;
  lastGameAt?: Date | string | null;
  totalScore?: number;
  totalGuessTimeSeconds?: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount?: number;
  twentyFiveKCount?: number;
  photosSubmittedCount?: number;
  followersCount?: number;
  buildingStats?: Record<string, BuildingStat>;
  lastOnline?: unknown;
  dailyStats?: Record<string, DailyStatBucket>;
  dailyStatsByDifficulty?: Record<string, Record<string, DailyStatBucket>>;
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

export interface BuildingStat {
  building: string;
  floor: number | null;
  totalScore: number;
  count: number;
}

export interface DailyStatBucket {
  gamesPlayed: number;
  roundsPlayed?: number;
  totalScore: number;
  totalGuessTimeSeconds: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount: number;
  twentyFiveKCount: number;
  photosSubmittedCount: number;
  buildingStats: Record<string, BuildingStat>;
  byRoundCount?: Partial<Record<'5' | '10' | '20', DailyStatBucketRound>>;
}

export interface DailyStatBucketRound {
  gamesPlayed: number;
  roundsPlayed: number;
  totalScore: number;
  totalGuessTimeSeconds: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount: number;
  twentyFiveKCount: number;
  buildingStats: Record<string, BuildingStat>;
}

const FALLBACK_FAVORITE_EMOTE = '😎';

export function normalizeFavoriteEmote(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Favorite emote cannot be empty.');
  }
  if (trimmed.length > 16) {
    throw new Error('Favorite emote is too long.');
  }
  return trimmed;
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
  const trimmedUsername = username.trim();
  const userData: Record<string, unknown> = {
    uid,
    email,
    emailLower: email.toLowerCase(),
    username: trimmedUsername,
    usernameLower: trimmedUsername.toLowerCase(),
    favoriteEmote: FALLBACK_FAVORITE_EMOTE,
    isAdmin,
    emailVerified: false,
    totalXp: 0,
    gamesPlayed: 0,
    createdAt: serverTimestamp(),
    // Updated on login + meaningful activity via server time.
    lastActive: serverTimestamp(),
    totalScore: 0,
    totalGuessTimeSeconds: 0,
    fiveKCount: 0,
    twentyFiveKCount: 0,
    photosSubmittedCount: 0,
    followersCount: 0,
    buildingStats: {},
    lastOnline: serverTimestamp(),
    dailyStats: {},
    dailyStatsByDifficulty: {},
    // Track when the username was last set to enforce change frequency
    lastUsernameChange: serverTimestamp()
  };
  // Hardcoded admin gets all permissions on creation
  if (isAdmin) {
    userData.permissions = getAllPermissions();
  }

  // Use a transaction to atomically create user doc and reserve username
  await runTransaction(db, async (transaction) => {
    // Check if username is already taken
    const usernameSnap = await transaction.get(usernameRef);
    if (usernameSnap.exists()) {
      throw new Error('Username is already taken.');
    }

    // Create the user document
    transaction.set(userRef, userData);

    // Reserve the username
    transaction.set(usernameRef, { uid, username: trimmedUsername });
  });
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
  const usersRef = collection(db, 'users');
  const trimmed = username.trim();
  const lower = trimmed.toLowerCase();

  // Prefer case-insensitive index when available
  const qLower = query(usersRef, where('usernameLower', '==', lower));
  const snapLower = await getDocs(qLower);
  if (!snapLower.empty) {
    if (excludeUid) {
      return snapLower.docs.some(docSnap => docSnap.id !== excludeUid);
    }
    return true;
  }

  // Fallback: exact username match (for users without usernameLower)
  const qExact = query(usersRef, where('username', '==', trimmed));
  const snapshot = await getDocs(qExact);
  if (!snapshot.empty) {
    if (excludeUid) {
      return snapshot.docs.some(docSnap => docSnap.id !== excludeUid);
    }
    return true;
  }

  // Final fallback: scan and compare case-insensitively for legacy users
  const allSnap = await getDocs(usersRef);
  const match = allSnap.docs.find(docSnap => {
    const data = docSnap.data() as { username?: string };
    return (data.username || '').toLowerCase() === lower && docSnap.id !== excludeUid;
  });
  return !!match;
}

/**
 * Lookup a user document by username (case-insensitive; prefers usernameLower if present).
 * Returns null if not found.
 */
export async function getUserByUsername(username: string): Promise<{ uid: string; email: string } | null> {
  const usersRef = collection(db, 'users');
  const trimmed = username.trim();
  const lower = trimmed.toLowerCase();

  // Try case-insensitive index
  const qLower = query(usersRef, where('usernameLower', '==', lower));
  const snapLower = await getDocs(qLower);
  if (!snapLower.empty) {
    const docSnap = snapLower.docs[0];
    const data = docSnap.data() as { email?: string };
    return { uid: docSnap.id, email: data.email };
  }

  // Fallback: exact match on username
  const qExact = query(usersRef, where('username', '==', trimmed));
  const snapExact = await getDocs(qExact);
  if (!snapExact.empty) {
    const docSnap = snapExact.docs[0];
    const data = docSnap.data() as { email?: string };
    return { uid: docSnap.id, email: data.email };
  }

  // Final fallback: scan and compare case-insensitively
  const allSnap = await getDocs(usersRef);
  const match = allSnap.docs.find(docSnap => {
    const data = docSnap.data() as { username?: string; email?: string };
    return (data.username || '').toLowerCase() === lower;
  });
  if (!match) return null;
  const data = match.data() as { email?: string };
  return { uid: match.id, email: data.email };
}

/**
 * Check if a user is the hardcoded admin (always admin regardless of DB)
 */
export function isHardcodedAdmin(uid: string): boolean {
  return uid === HARDCODED_ADMIN_UID;
}

/**
 * Check if an account with the given email exists and is verified.
 * Returns { exists: boolean, verified: boolean }
 */
export async function checkEmailVerificationStatus(email: string): Promise<{ exists: boolean; verified: boolean }> {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('emailLower', '==', email.toLowerCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { exists: false, verified: false };
  }

  const userDoc = snapshot.docs[0].data() as UserDoc;
  return { exists: true, verified: userDoc.emailVerified === true };
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
  const forbidden = ['uid', 'createdAt', 'permissions', 'lastActive'];
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
    const existing = await getUserDoc(uid);
    if (!existing) {
      throw new Error('User not found.');
    }

    const trimmed = (updates.username as string).trim();
    if (!trimmed) {
      throw new Error('Username cannot be empty.');
    }
    if (trimmed.length < 3) {
      throw new Error('Username must be at least 3 characters.');
    }

    // Enforce one username change per 30 days
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const lastChange = existing.lastUsernameChange as { toDate?: () => Date } | Date | undefined;
    if (lastChange) {
      const lastDate = (typeof lastChange === 'object'
        && lastChange !== null
        && 'toDate' in lastChange
        && typeof (lastChange as { toDate?: unknown }).toDate === 'function')
        ? (lastChange as { toDate: () => Date }).toDate()
        : (lastChange as Date);
      const now = Date.now();
      if (lastDate instanceof Date && !isNaN(lastDate.getTime())) {
        const diff = now - lastDate.getTime();
        if (diff < THIRTY_DAYS_MS) {
          const daysRemaining = Math.ceil((THIRTY_DAYS_MS - diff) / (24 * 60 * 60 * 1000));
          throw new Error(`Username can only be changed once every 30 days. Try again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`);
        }
      }
    }

    const taken = await isUsernameTaken(trimmed, uid);
    if (taken) {
      throw new Error('Username is already taken. Please choose another.');
    }
    updates.username = trimmed;
    updates.usernameLower = trimmed.toLowerCase();
    updates.lastUsernameChange = serverTimestamp();
  }

  // Validate totalXp if being changed
  if ('totalXp' in updates) {
    const xp = Number(updates.totalXp);
    if (isNaN(xp) || xp < 0) {
      throw new Error('Total XP must be a non-negative number.');
    }
    updates.totalXp = xp;
  }

  // Validate favoriteEmote if being changed
  if ('favoriteEmote' in updates && typeof updates.favoriteEmote === 'string') {
    updates.favoriteEmote = normalizeFavoriteEmote(updates.favoriteEmote);
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

  // If username changed, propagate to denormalized copies in other collections
  if ('username' in updates) {
    const newUsername = updates.username as string;
    await propagateUsernameChange(uid, newUsername);
  }
}

/**
 * Update denormalized username fields across collections so others see the change.
 */
async function propagateUsernameChange(uid: string, newUsername: string): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  // Update lobbies: hostUsername and players[].username
  tasks.push((async () => {
    const lobbiesSnap = await getDocs(collection(db, 'lobbies'));
    const updates: Promise<unknown>[] = [];
    lobbiesSnap.forEach(docSnap => {
      const data = docSnap.data() as { hostUid?: string; hostUsername?: string; players?: Array<{ uid: string; username: string }> };
      let changed = false;
      const next: typeof data.players = Array.isArray(data.players)
        ? data.players.map(p => {
          if (p.uid === uid && p.username !== newUsername) {
            changed = true;
            return { ...p, username: newUsername };
          }
          return p;
        })
        : [];

      if (data.hostUid === uid && data.hostUsername !== newUsername) {
        changed = true;
      }

      if (changed) {
        const payload: Record<string, unknown> = { players: next };
        if (data.hostUid === uid) {
          payload.hostUsername = newUsername;
        }
        updates.push(updateDoc(doc(db, 'lobbies', docSnap.id), payload));
      }
    });
    await Promise.all(updates);
  })());

  // Update friend requests: fromUsername / toUsername
  tasks.push((async () => {
    const requestsRef = collection(db, 'friendRequests');
    const [fromSnap, toSnap] = await Promise.all([
      getDocs(query(requestsRef, where('fromUid', '==', uid))),
      getDocs(query(requestsRef, where('toUid', '==', uid)))
    ]);

    const updates: Promise<unknown>[] = [];
    fromSnap.forEach(docSnap => {
      const data = docSnap.data() as { fromUsername?: string };
      if (data.fromUsername !== newUsername) {
        updates.push(updateDoc(docSnap.ref, { fromUsername: newUsername }));
      }
    });
    toSnap.forEach(docSnap => {
      const data = docSnap.data() as { toUsername?: string };
      if (data.toUsername !== newUsername) {
        updates.push(updateDoc(docSnap.ref, { toUsername: newUsername }));
      }
    });

    await Promise.all(updates);
  })());

  // Update friendships: usernames map entry
  tasks.push((async () => {
    const friendshipsRef = collection(db, 'friendships');
    const friendshipsSnap = await getDocs(query(friendshipsRef, where('users', 'array-contains', uid)));
    const updates: Promise<unknown>[] = [];
    friendshipsSnap.forEach(docSnap => {
      const data = docSnap.data() as { usernames?: Record<string, string> };
      const usernames = { ...(data.usernames || {}) };
      if (usernames[uid] !== newUsername) {
        usernames[uid] = newUsername;
        updates.push(updateDoc(docSnap.ref, { usernames }));
      }
    });
    await Promise.all(updates);
  })());

  await Promise.all(tasks);
}
