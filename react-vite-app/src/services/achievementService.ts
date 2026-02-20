import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type AchievementDifficulty = 'easy' | 'medium' | 'hard';
export type AchievementId =
  | 'first-game'
  | 'weekend-warrior'
  | 'bullseye'
  | 'xp-collector'
  | 'rising-star'
  | 'verified-account'
  | 'easy-finish'
  | 'medium-finish'
  | 'hard-finish';

export interface AchievementMeta {
  id: AchievementId;
  title: string;
  icon: string;
  highlight: string;
  details: string;
  xpReward: number;
}

export interface AchievementUpdateDetail {
  id?: AchievementId;
  unlocked?: boolean;
  rewardXp?: number;
}

export interface AchievementProgressInput {
  gamesPlayed: number;
  totalXp: number;
  level: number;
  emailVerified: boolean;
}

export const ACHIEVEMENTS_UPDATED_EVENT = 'hwg-achievements-updated';

const ACHIEVEMENT_META_BY_ID: Record<AchievementId, AchievementMeta> = {
  'first-game': {
    id: 'first-game',
    title: 'First Steps',
    icon: '🧭',
    highlight: 'Play your first game.',
    details: 'Start your GeoGuessr journey by completing one full game.',
    xpReward: 5000
  },
  'weekend-warrior': {
    id: 'weekend-warrior',
    title: 'Marathon Mapper',
    icon: '🏃',
    highlight: 'Play 25 games.',
    details: 'Keep grinding and finish twenty-five total games.',
    xpReward: 18000
  },
  'bullseye': {
    id: 'bullseye',
    title: 'Bullseye',
    icon: '🎯',
    highlight: 'Score 5,000 points in a round.',
    details: 'Land a perfect round score with pinpoint accuracy.',
    xpReward: 20000
  },
  'xp-collector': {
    id: 'xp-collector',
    title: 'XP Collector',
    icon: '⚡',
    highlight: 'Earn 5,000 total XP.',
    details: 'Build momentum by stacking enough XP across matches.',
    xpReward: 15000
  },
  'rising-star': {
    id: 'rising-star',
    title: 'Rising Star',
    icon: '⭐',
    highlight: 'Reach level 10.',
    details: 'Push your level up through consistent performance.',
    xpReward: 22000
  },
  'verified-account': {
    id: 'verified-account',
    title: 'Verified Account',
    icon: '✅',
    highlight: 'Verify your email address.',
    details: 'Secure your profile and confirm account ownership.',
    xpReward: 8000
  },
  'easy-finish': {
    id: 'easy-finish',
    title: 'Easy Clear',
    icon: '🟢',
    highlight: 'Finish a full game on Easy difficulty.',
    details: 'Complete all rounds in an Easy run.',
    xpReward: 10000
  },
  'medium-finish': {
    id: 'medium-finish',
    title: 'Medium Clear',
    icon: '🟡',
    highlight: 'Finish a full game on Medium difficulty.',
    details: 'Complete all rounds in a Medium run.',
    xpReward: 25000
  },
  'hard-finish': {
    id: 'hard-finish',
    title: 'Hard Clear',
    icon: '🔴',
    highlight: 'Finish a full game on Hard difficulty.',
    details: 'Complete all rounds in a Hard run.',
    xpReward: 40000
  }
};

const UNLOCKED_KEY_PREFIX = 'hwg-achievement-unlocked:';
const REWARDED_KEY_PREFIX = 'hwg-achievement-rewarded:';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readBooleanStorage(key: string): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(key) === '1';
}

function writeBooleanStorage(key: string, value: boolean): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, value ? '1' : '0');
}

function unlockedKey(id: AchievementId): string {
  return `${UNLOCKED_KEY_PREFIX}${id}`;
}

function rewardedKey(id: AchievementId): string {
  return `${REWARDED_KEY_PREFIX}${id}`;
}

function emitAchievementsUpdated(detail?: AchievementUpdateDetail): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent<AchievementUpdateDetail>(ACHIEVEMENTS_UPDATED_EVENT, { detail }));
}

export function getAchievementMetaById(id: AchievementId): AchievementMeta {
  return ACHIEVEMENT_META_BY_ID[id];
}

export function getAllAchievementMeta(): AchievementMeta[] {
  return Object.values(ACHIEVEMENT_META_BY_ID);
}

export function isAchievementUnlocked(id: AchievementId): boolean {
  return readBooleanStorage(unlockedKey(id));
}

export function markAchievementUnlocked(id: AchievementId): boolean {
  if (isAchievementUnlocked(id)) return false;
  writeBooleanStorage(unlockedKey(id), true);
  return true;
}

export function getDifficultyAchievementId(difficulty: string | null | undefined): AchievementId | null {
  if (difficulty === 'easy') return 'easy-finish';
  if (difficulty === 'medium') return 'medium-finish';
  if (difficulty === 'hard') return 'hard-finish';
  return null;
}

export function getProgressUnlockedAchievementIds(progress: AchievementProgressInput): AchievementId[] {
  const ids: AchievementId[] = [];
  if (progress.gamesPlayed >= 1) ids.push('first-game');
  if (progress.gamesPlayed >= 25) ids.push('weekend-warrior');
  if (progress.totalXp >= 5000) ids.push('xp-collector');
  if (progress.level >= 10) ids.push('rising-star');
  if (progress.emailVerified) ids.push('verified-account');
  return ids;
}

export function clearAchievementUnlocked(id: AchievementId): void {
  writeBooleanStorage(unlockedKey(id), false);
}

async function grantAchievementReward(uid: string, id: AchievementId): Promise<number> {
  const key = rewardedKey(id);
  if (readBooleanStorage(key)) return 0;

  const rewardXp = getAchievementMetaById(id).xpReward;
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, { totalXp: increment(rewardXp) });
  writeBooleanStorage(key, true);
  return rewardXp;
}

export async function unlockAchievement(uid: string, id: AchievementId): Promise<number> {
  const newlyUnlocked = markAchievementUnlocked(id);
  if (!newlyUnlocked) return 0;

  const rewardXp = await grantAchievementReward(uid, id);
  emitAchievementsUpdated({ id, unlocked: true, rewardXp });
  return rewardXp;
}
