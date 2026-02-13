import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// This user is ALWAYS an admin, regardless of their Firestore isAdmin field
const HARDCODED_ADMIN_UID = 'bL0Ww9dSPbeDAGSDVlhljYMnqfE3';

/**
 * Create a new user document in Firestore
 */
export async function createUserDoc(uid, email, username) {
  const userRef = doc(db, 'users', uid);
  const isAdmin = uid === HARDCODED_ADMIN_UID;
  await setDoc(userRef, {
    uid,
    email,
    username,
    isAdmin,
    createdAt: serverTimestamp()
  });
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
    // Hardcoded admin is ALWAYS an admin
    if (uid === HARDCODED_ADMIN_UID) {
      data.isAdmin = true;
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
    // Hardcoded admin is ALWAYS an admin
    if (docSnap.id === HARDCODED_ADMIN_UID) {
      data.isAdmin = true;
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
  await updateDoc(userRef, { isAdmin });
}

/**
 * Update a user's profile fields (admin operation)
 * Validates username uniqueness, protects hardcoded admin status,
 * and prevents modification of system fields (uid, createdAt).
 */
export async function updateUserProfile(uid, updates) {
  // Prevent changing system-managed fields
  const forbidden = ['uid', 'createdAt'];
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

  await updateUserDoc(uid, updates);
}
