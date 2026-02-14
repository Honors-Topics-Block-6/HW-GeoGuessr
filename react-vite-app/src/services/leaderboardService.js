import { collection, query, orderBy, limit, getDocs, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelInfo, getLevelTitle } from '../utils/xpLevelling';

/**
 * Fetch the top players ordered by totalXp descending.
 * Each entry includes computed level info.
 * @param {number} limitCount - max number of players to return (default 50)
 * @returns {Promise<Array<{ uid: string, username: string, totalXp: number, gamesPlayed: number, level: number, levelTitle: string, levelInfo: object }>>}
 */
export async function getLeaderboard(limitCount = 50) {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, orderBy('totalXp', 'desc'), limit(limitCount));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap, index) => {
    const data = docSnap.data();
    const totalXp = data.totalXp ?? 0;
    const levelInfo = getLevelInfo(totalXp);
    const levelTitle = getLevelTitle(levelInfo.level);

    return {
      uid: docSnap.id,
      username: data.username ?? 'Unknown',
      totalXp,
      gamesPlayed: data.gamesPlayed ?? 0,
      level: levelInfo.level,
      levelTitle,
      levelInfo,
      rank: index + 1
    };
  });
}

/**
 * Get the rank of a specific user (1-based).
 * Counts how many users have more XP, then adds 1.
 * @param {string} uid - the user's UID
 * @param {number} userTotalXp - the user's total XP
 * @returns {Promise<number>} rank (1 = highest)
 */
export async function getUserRank(uid, userTotalXp) {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('totalXp', '>', userTotalXp));

  try {
    const countSnap = await getCountFromServer(q);
    return countSnap.data().count + 1;
  } catch {
    // Fallback: if getCountFromServer isn't available, fetch docs
    const snapshot = await getDocs(q);
    return snapshot.size + 1;
  }
}
