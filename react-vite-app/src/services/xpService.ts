import { doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

export interface UserXpStats {
  totalXp: number;
  gamesPlayed: number;
}

// ────── Functions ──────

/**
 * Get the current XP stats for a user.
 * Returns { totalXp, gamesPlayed } or defaults if fields are missing.
 */
export async function getUserXp(uid: string): Promise<UserXpStats> {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return { totalXp: 0, gamesPlayed: 0 };
  }

  const data = snapshot.data();
  return {
    totalXp: (data.totalXp as number) ?? 0,
    gamesPlayed: (data.gamesPlayed as number) ?? 0
  };
}

/**
 * Award XP to a user after a completed game.
 * Uses Firestore `increment()` for atomic updates so concurrent
 * games cannot cause lost XP.
 */
export async function awardXp(uid: string, xpEarned: number): Promise<void> {
  if (!uid || xpEarned < 0) return;

  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    totalXp: increment(xpEarned),
    gamesPlayed: increment(1),
    lastGameAt: serverTimestamp(),
    // Meaningful activity: completed a game and submitted a score.
    lastActive: serverTimestamp()
  });
}
