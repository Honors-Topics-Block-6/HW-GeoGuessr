import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
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
  favoriteEmote: string;
  totalXp: number;
  gamesPlayed: number;
  totalScore: number;
  totalGuessTimeSeconds: number;
  fastestGuessTimeSeconds: number;
  fiveKCount: number;
  twentyFiveKCount: number;
  photosSubmittedCount: number;
  level: number;
  levelTitle: string;
  levelInfo: LevelInfo;
  statValue: number;
  rank: number;
}

export type LeaderboardCategory =
  | 'level'
  | 'gamesPlayed'
  | 'averageScore'
  | 'fiveKCount'
  | 'twentyFiveKCount'
  | 'averageGuessTime'
  | 'photosSubmittedCount';

interface RawUserStats {
  uid: string;
  username: string;
  favoriteEmote: string;
  totalXp: number;
  gamesPlayed: number;
  totalScore: number;
  totalGuessTimeSeconds: number;
  fastestGuessTimeSeconds: number;
  fiveKCount: number;
  twentyFiveKCount: number;
  photosSubmittedCount: number;
}

const DIRECT_FIELD_BY_CATEGORY: Partial<Record<LeaderboardCategory, keyof RawUserStats>> = {
  gamesPlayed: 'gamesPlayed',
  fiveKCount: 'fiveKCount',
  twentyFiveKCount: 'twentyFiveKCount',
  photosSubmittedCount: 'photosSubmittedCount'
};

function getCategorySortDirection(category: LeaderboardCategory): 'asc' | 'desc' {
  if (category === 'averageGuessTime') {
    return 'asc';
  }
  return 'desc';
}

function computeCategoryValue(stats: RawUserStats, category: LeaderboardCategory): number {
  switch (category) {
    case 'level':
      return getLevelInfo(stats.totalXp).level;
    case 'gamesPlayed':
      return stats.gamesPlayed;
    case 'averageScore':
      return stats.gamesPlayed > 0 ? stats.totalScore / stats.gamesPlayed : 0;
    case 'fiveKCount':
      return stats.fiveKCount;
    case 'twentyFiveKCount':
      return stats.twentyFiveKCount;
    case 'averageGuessTime':
      return stats.fastestGuessTimeSeconds;
    case 'photosSubmittedCount':
      return stats.photosSubmittedCount;
    default:
      return 0;
  }
}

function shouldIncludeInCategory(stats: RawUserStats, category: LeaderboardCategory): boolean {
  if (category === 'averageGuessTime') {
    return stats.fastestGuessTimeSeconds > 0;
  }
  return true;
}

function mapRawStats(docId: string, data: Record<string, unknown>): RawUserStats {
  return {
    uid: docId,
    username: (data.username as string) ?? 'Unknown',
    favoriteEmote: (data.favoriteEmote as string) ?? '😎',
    totalXp: (data.totalXp as number) ?? 0,
    gamesPlayed: (data.gamesPlayed as number) ?? 0,
    totalScore: (data.totalScore as number) ?? 0,
    totalGuessTimeSeconds: (data.totalGuessTimeSeconds as number) ?? 0,
    fastestGuessTimeSeconds: (data.fastestGuessTimeSeconds as number) ?? 0,
    fiveKCount: (data.fiveKCount as number) ?? 0,
    twentyFiveKCount: (data.twentyFiveKCount as number) ?? 0,
    photosSubmittedCount: (data.photosSubmittedCount as number) ?? 0
  };
}

function toLeaderboardEntry(stats: RawUserStats, category: LeaderboardCategory, rank: number): LeaderboardEntry {
  const levelInfo = getLevelInfo(stats.totalXp) as LevelInfo;
  const levelTitle = getLevelTitle(levelInfo.level);

  return {
    uid: stats.uid,
    username: stats.username,
    favoriteEmote: stats.favoriteEmote,
    totalXp: stats.totalXp,
    gamesPlayed: stats.gamesPlayed,
    totalScore: stats.totalScore,
    totalGuessTimeSeconds: stats.totalGuessTimeSeconds,
    fastestGuessTimeSeconds: stats.fastestGuessTimeSeconds,
    fiveKCount: stats.fiveKCount,
    twentyFiveKCount: stats.twentyFiveKCount,
    photosSubmittedCount: stats.photosSubmittedCount,
    level: levelInfo.level,
    levelTitle,
    levelInfo,
    statValue: computeCategoryValue(stats, category),
    rank
  };
}

function sortRawStats(rows: RawUserStats[], category: LeaderboardCategory): RawUserStats[] {
  const direction = getCategorySortDirection(category);
  const sorted = rows.filter((entry) => shouldIncludeInCategory(entry, category));
  sorted.sort((a: RawUserStats, b: RawUserStats) => {
    const aValue = computeCategoryValue(a, category);
    const bValue = computeCategoryValue(b, category);
    if (aValue === bValue) {
      // Stable tie-breaks so ordering doesn't flicker.
      if (b.totalXp !== a.totalXp) {
        return b.totalXp - a.totalXp;
      }
      return a.username.localeCompare(b.username);
    }
    return direction === 'desc' ? bValue - aValue : aValue - bValue;
  });
  return sorted;
}

async function fetchAllUserStats(): Promise<RawUserStats[]> {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  return snapshot.docs.map((docSnap) => mapRawStats(docSnap.id, docSnap.data() as Record<string, unknown>));
}

export async function getLeaderboardByCategory(
  category: LeaderboardCategory,
  limitCount: number = 50
): Promise<LeaderboardEntry[]> {
  const usersRef = collection(db, 'users');
  const directField = DIRECT_FIELD_BY_CATEGORY[category];
  if (directField) {
    const direction = getCategorySortDirection(category);
    const q = query(usersRef, orderBy(directField, direction), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap, index) =>
      toLeaderboardEntry(mapRawStats(docSnap.id, docSnap.data() as Record<string, unknown>), category, index + 1)
    );
  }

  const allUsers = await fetchAllUserStats();
  const sorted = sortRawStats(allUsers, category);
  return sorted.slice(0, limitCount).map((stats, index) => toLeaderboardEntry(stats, category, index + 1));
}

export async function getUserRankByCategory(
  uid: string,
  category: LeaderboardCategory,
  userValue: number
): Promise<number | null> {
  const usersRef = collection(db, 'users');
  const direction = getCategorySortDirection(category);
  const directField = DIRECT_FIELD_BY_CATEGORY[category];
  if (directField) {
    const operator = direction === 'desc' ? '>' : '<';
    const q = query(usersRef, where(directField, operator, userValue));
    try {
      const countSnap = await getCountFromServer(q);
      return countSnap.data().count + 1;
    } catch {
      const snapshot = await getDocs(q);
      return snapshot.size + 1;
    }
  }

  const allUsers = await fetchAllUserStats();
  const sorted = sortRawStats(allUsers, category);
  const foundIndex = sorted.findIndex((entry) => entry.uid === uid);
  if (foundIndex === -1) {
    return null;
  }
  return foundIndex + 1;
}

export async function getComparisonValuesByCategory(category: LeaderboardCategory): Promise<number[]> {
  const allUsers = await fetchAllUserStats();
  return allUsers
    .filter((stats) => shouldIncludeInCategory(stats, category))
    .map((stats) => computeCategoryValue(stats, category));
}
