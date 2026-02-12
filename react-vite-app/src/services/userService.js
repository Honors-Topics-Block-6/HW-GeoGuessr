import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Create a new user document in Firestore
 */
export async function createUserDoc(uid, email, username) {
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, {
    uid,
    email,
    username,
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
    return snapshot.data();
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
