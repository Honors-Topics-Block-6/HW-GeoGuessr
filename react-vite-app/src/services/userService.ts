import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

// This user is ALWAYS an admin, regardless of their Firestore isAdmin field
const HARDCODED_ADMIN_UID = 'bL0Ww9dSPbeDAGSDVlhljYMnqfE3';

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
  avatarURL?: string | null;
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
  const userRef = doc(db, 'users', uid);
  const isAdmin = uid === HARDCODED_ADMIN_UID;
  const userData: Record<string, unknown> = {
    uid,
    email,
    emailLower: email.toLowerCase(),
    username,
    isAdmin,
    emailVerified: false,
    totalXp: 0,
    gamesPlayed: 0,
    createdAt: serverTimestamp()
  };
  // Hardcoded admin gets all permissions on creation
  if (isAdmin) {
    userData.permissions = getAllPermissions();
  }
  await setDoc(userRef, userData);
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
  const q = query(usersRef, where('username', '==', username));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return false;

  // If we're excluding a uid, check if the only match is that user
  if (excludeUid) {
    return snapshot.docs.some(docSnap => docSnap.id !== excludeUid);
  }

  return true;
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
    const taken = await isUsernameTaken(trimmed, uid);
    if (taken) {
      throw new Error('Username is already taken. Please choose another.');
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

  await updateUserDoc(uid, updates as Record<string, unknown>);
}
