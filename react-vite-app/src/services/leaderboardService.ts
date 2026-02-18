import { collection, query, orderBy, limit, getDocs, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelInfo, getLevelTitle } from '../utils/xpLevelling';

// ────── Types ──────

export interface LevelInfo {
  level: number;
  currentLevelXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progress: number;
}

export interface LeaderboardEntry {
  uid: string;
  username: string;
  totalXp: number;
  gamesPlayed: number;
  level: number;
  levelTitle: string;
  levelInfo: LevelInfo;
  rank: number;
}

// ────── Functions ──────

/**
 * Fetch the top players ordered by totalXp descending.
 * Each entry includes computed level info.
 */
export async function getLeaderboard(limitCount: number = 50): Promise<LeaderboardEntry[]> {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, orderBy('totalXp', 'desc'), limit(limitCount));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap, index) => {
    const data = docSnap.data();
    const totalXp: number = data.totalXp ?? 0;
    const levelInfo = getLevelInfo(totalXp) as LevelInfo;
    const levelTitle = getLevelTitle(levelInfo.level);

    return {
      uid: docSnap.id,
      username: (data.username as string) ?? 'Unknown',
      totalXp,
      gamesPlayed: (data.gamesPlayed as number) ?? 0,
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
 */
export async function getUserRank(_uid: string, userTotalXp: number): Promise<number> {
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
