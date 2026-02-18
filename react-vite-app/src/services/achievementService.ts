export type AchievementDifficulty = 'easy' | 'medium' | 'hard';

export const ACHIEVEMENTS_UPDATED_EVENT = 'hwg-achievements-updated';

export interface AchievementUpdateDetail {
  id?: string;
  unlocked?: boolean;
}

interface AchievementMeta {
  title: string;
  description: string;
  icon: string;
}

const TEST_ACHIEVEMENT_KEY = 'hwg-achievement-test-unlocked';
const DIFFICULTY_KEYS: Record<AchievementDifficulty, string> = {
  easy: 'hwg-achievement-difficulty-easy',
  medium: 'hwg-achievement-difficulty-medium',
  hard: 'hwg-achievement-difficulty-hard'
};

interface AchievementFlags {
  testUnlocked: boolean;
  difficulties: Record<AchievementDifficulty, boolean>;
}

const ACHIEVEMENT_META_BY_ID: Record<string, AchievementMeta> = {
  'first-game': { title: 'First Steps', description: 'Play your first game.', icon: '🧭' },
  'weekend-warrior': { title: 'Weekend Warrior', description: 'Play 25 games.', icon: '🎯' },
  'xp-collector': { title: 'XP Collector', description: 'Earn 5,000 total XP.', icon: '⚡' },
  'rising-star': { title: 'Rising Star', description: 'Reach level 10.', icon: '⭐' },
  'verified-account': { title: 'Verified Account', description: 'Verify your email address.', icon: '✅' },
  'test-achievement': { title: 'QA Toggle', description: 'Unlocked with the test button on the home page.', icon: '🧪' },
  'easy-finish': { title: 'Easy Clear', description: 'Finish a full game on Easy difficulty.', icon: '🟢' },
  'medium-finish': { title: 'Medium Clear', description: 'Finish a full game on Medium difficulty.', icon: '🟡' },
  'hard-finish': { title: 'Hard Clear', description: 'Finish a full game on Hard difficulty.', icon: '🔴' }
};

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

function emitAchievementsUpdated(detail?: AchievementUpdateDetail): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent<AchievementUpdateDetail>(ACHIEVEMENTS_UPDATED_EVENT, { detail }));
}

export function getAchievementFlags(): AchievementFlags {
  return {
    testUnlocked: readBooleanStorage(TEST_ACHIEVEMENT_KEY),
    difficulties: {
      easy: readBooleanStorage(DIFFICULTY_KEYS.easy),
      medium: readBooleanStorage(DIFFICULTY_KEYS.medium),
      hard: readBooleanStorage(DIFFICULTY_KEYS.hard)
    }
  };
}

export function isTestAchievementUnlocked(): boolean {
  return readBooleanStorage(TEST_ACHIEVEMENT_KEY);
}

export function setTestAchievementUnlocked(unlocked: boolean): void {
  const previous = isTestAchievementUnlocked();
  if (previous === unlocked) return;
  writeBooleanStorage(TEST_ACHIEVEMENT_KEY, unlocked);
  emitAchievementsUpdated({ id: 'test-achievement', unlocked });
}

export function toggleTestAchievementUnlocked(): boolean {
  const next = !isTestAchievementUnlocked();
  setTestAchievementUnlocked(next);
  return next;
}

export function markDifficultyAchievementUnlocked(difficulty: string | null | undefined): boolean {
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') return false;

  const storageKey = DIFFICULTY_KEYS[difficulty];
  const alreadyUnlocked = readBooleanStorage(storageKey);
  if (alreadyUnlocked) return false;

  writeBooleanStorage(storageKey, true);
  const achievementId = `${difficulty}-finish`;
  emitAchievementsUpdated({ id: achievementId, unlocked: true });
  return true;
}

export function getAchievementMetaById(id: string): AchievementMeta | null {
  return ACHIEVEMENT_META_BY_ID[id] ?? null;
}
