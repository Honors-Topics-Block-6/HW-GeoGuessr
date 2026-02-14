import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// This user is ALWAYS an admin, regardless of their Firestore isAdmin field
const HARDCODED_ADMIN_UID = 'bL0Ww9dSPbeDAGSDVlhljYMnqfE3';

/**
 * All available admin permissions.
 * Each key is stored as a boolean in the user's `permissions` map in Firestore.
 */
export const ADMIN_PERMISSIONS = {
  REVIEW_SUBMISSIONS: 'reviewSubmissions',
  DELETE_PHOTOS: 'deletePhotos',
  EDIT_MAP: 'editMap',
  VIEW_ACCOUNTS: 'viewAccounts',
  EDIT_ACCOUNTS: 'editAccounts',
  MESSAGE_ACCOUNTS: 'messageAccounts',
  MANAGE_ADMINS: 'manageAdmins',
  MANAGE_FRIENDS_CHATS: 'manageFriendsChats',
  MANAGE_BUG_REPORTS: 'manageBugReports',
};

/**
 * Human-readable labels for each permission (used in UI)
 */
export const PERMISSION_LABELS = {
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

/**
 * Returns a permissions object with ALL permissions set to true.
 * Used for the hardcoded admin and as a convenience for granting full access.
 */
export function getAllPermissions() {
  return Object.fromEntries(
    Object.values(ADMIN_PERMISSIONS).map(p => [p, true])
  );
}

/**
 * Returns a permissions object with ALL permissions set to false.
 */
export function getNoPermissions() {
  return Object.fromEntries(
    Object.values(ADMIN_PERMISSIONS).map(p => [p, false])
  );
}

/**
 * Create a new user document in Firestore
 */
export async function createUserDoc(uid, email, username) {
  const userRef = doc(db, 'users', uid);
  const isAdmin = uid === HARDCODED_ADMIN_UID;
  const userData = {
    uid,
    email,
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
export async function getUserDoc(uid) {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) {
    const data = snapshot.data();
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
export async function updateUserDoc(uid, data) {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, data);
}

/**
 * Check if a username is already taken by another user
 * Optionally exclude a specific uid (for the current user editing their own username)
 */
export async function isUsernameTaken(username, excludeUid = null) {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('username', '==', username));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return false;

  // If we're excluding a uid, check if the only match is that user
  if (excludeUid) {
    return snapshot.docs.some(doc => doc.id !== excludeUid);
  }

  return true;
}

/**
 * Check if a user is the hardcoded admin (always admin regardless of DB)
 */
export function isHardcodedAdmin(uid) {
  return uid === HARDCODED_ADMIN_UID;
}

/**
 * Get all user documents from Firestore
 * Used by admins to manage accounts
 */
export async function getAllUsers() {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
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
export async function setUserAdmin(uid, isAdmin) {
  // Prevent removing admin from the hardcoded admin
  if (uid === HARDCODED_ADMIN_UID && !isAdmin) {
    throw new Error('Cannot remove admin status from this user.');
  }
  const userRef = doc(db, 'users', uid);
  const updates = { isAdmin };
  // When granting admin, give all permissions by default
  // When revoking admin, clear all permissions
  updates.permissions = isAdmin ? getAllPermissions() : getNoPermissions();
  await updateDoc(userRef, updates);
}

/**
 * Update a specific admin user's permissions map.
 * Cannot modify hardcoded admin's permissions.
 */
export async function updateUserPermissions(uid, permissions) {
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
export async function updateUserProfile(uid, updates) {
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
    const trimmed = updates.username.trim();
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
    const date = updates.lastGameAt instanceof Date ? updates.lastGameAt : new Date(updates.lastGameAt);
    if (isNaN(date.getTime())) {
      throw new Error('Last game date is invalid.');
    }
    updates.lastGameAt = date;
  }

  await updateUserDoc(uid, updates);
}
