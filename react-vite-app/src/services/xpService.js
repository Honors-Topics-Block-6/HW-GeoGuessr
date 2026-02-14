import { doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get the current XP stats for a user.
 * Returns { totalXp, gamesPlayed } or defaults if fields are missing.
 */
export async function getUserXp(uid) {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return { totalXp: 0, gamesPlayed: 0 };
  }

  const data = snapshot.data();
  return {
    totalXp: data.totalXp ?? 0,
    gamesPlayed: data.gamesPlayed ?? 0
  };
}

/**
 * Award XP to a user after a completed game.
 * Uses Firestore `increment()` for atomic updates so concurrent
 * games cannot cause lost XP.
 *
 * @param {string} uid - Firebase Auth UID
 * @param {number} xpEarned - points earned this game (game score)
 * @returns {Promise<void>}
 */
export async function awardXp(uid, xpEarned) {
  if (!uid || xpEarned < 0) return;

  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    totalXp: increment(xpEarned),
    gamesPlayed: increment(1),
    lastGameAt: serverTimestamp()
  });
}
