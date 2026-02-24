export const DAILY_STREAK_UPDATED_EVENT = 'hwg-daily-streak-updated';

export interface DailyStreakStorage {
  streak: number;
  /** YYYY-MM-DD in user's local timezone */
  lastPlayedDate: string | null;
}

const STORAGE_KEY_PREFIX = 'hwg-daily-streak.v1:';
const DAY_MS = 24 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function storageKey(uid: string): string {
  return `${STORAGE_KEY_PREFIX}${uid}`;
}

/**
 * Get a date string (YYYY-MM-DD) representing the user's local calendar day.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateParts(dateString: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return { y, m, d };
}

/**
 * Calendar-day difference between two YYYY-MM-DD strings (local calendar days).
 * Returns (to - from) in whole days, or null if parsing fails.
 *
 * Uses UTC day numbers to avoid DST 23/25h issues.
 */
export function calendarDayDiff(fromDateString: string, toDateString: string): number | null {
  const from = parseDateParts(fromDateString);
  const to = parseDateParts(toDateString);
  if (!from || !to) return null;

  const fromUtc = Date.UTC(from.y, from.m - 1, from.d);
  const toUtc = Date.UTC(to.y, to.m - 1, to.d);
  return Math.floor((toUtc - fromUtc) / DAY_MS);
}

function clampNonNegativeInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function readDailyStreakStorage(uid: string): DailyStreakStorage {
  if (!isBrowser() || !uid) return { streak: 0, lastPlayedDate: null };

  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return { streak: 0, lastPlayedDate: null };
    const parsed = JSON.parse(raw) as Partial<DailyStreakStorage>;

    const streak = clampNonNegativeInt(parsed.streak);
    const lastPlayedDate = typeof parsed.lastPlayedDate === 'string' ? parsed.lastPlayedDate : null;

    return { streak, lastPlayedDate };
  } catch {
    return { streak: 0, lastPlayedDate: null };
  }
}

export function writeDailyStreakStorage(uid: string, value: DailyStreakStorage): void {
  if (!isBrowser() || !uid) return;
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify(value));
  } catch {
    // ignore storage failures (private mode/quota/etc)
  }
}

function emitDailyStreakUpdated(uid: string, value: DailyStreakStorage): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(DAILY_STREAK_UPDATED_EVENT, { detail: { uid, ...value } }));
}

/**
 * Get the streak number that should be displayed right now.
 *
 * - If the user missed at least one full calendar day (diff > 1), streak is 0.
 * - Otherwise, keep the stored streak (prevents decrementing before the day is actually missed).
 */
export function getDisplayDailyStreak(uid: string, now: Date = new Date()): number {
  const stored = readDailyStreakStorage(uid);
  if (!stored.lastPlayedDate) return 0;

  const today = getLocalDateString(now);
  const diff = calendarDayDiff(stored.lastPlayedDate, today);

  // Invalid diff or future date -> treat as broken streak for display safety
  if (diff === null || diff < 0) return 0;
  if (diff > 1) return 0;
  return stored.streak;
}

/**
 * Ensure storage reflects a broken streak.
 * If the user hasn't played in 2+ calendar days, we reset stored streak to 0
 * (without changing lastPlayedDate).
 */
export function syncDailyStreakRollover(uid: string, now: Date = new Date()): DailyStreakStorage {
  const stored = readDailyStreakStorage(uid);
  if (!stored.lastPlayedDate) return stored;

  const today = getLocalDateString(now);
  const diff = calendarDayDiff(stored.lastPlayedDate, today);
  if (diff === null || diff < 0) {
    const next = { streak: 0, lastPlayedDate: stored.lastPlayedDate };
    writeDailyStreakStorage(uid, next);
    emitDailyStreakUpdated(uid, next);
    return next;
  }

  if (diff > 1 && stored.streak !== 0) {
    const next = { streak: 0, lastPlayedDate: stored.lastPlayedDate };
    writeDailyStreakStorage(uid, next);
    emitDailyStreakUpdated(uid, next);
    return next;
  }

  return stored;
}

export interface RecordDailyPlayResult {
  updated: boolean;
  streak: number;
  lastPlayedDate: string;
}

/**
 * Record that the user played today (once per calendar day).
 *
 * Rules:
 * - First time: streak = 1
 * - Same day: streak unchanged (prevents multi-increment)
 * - Next day: streak += 1
 * - Missed 1+ days: streak = 1 (new streak starts today)
 */
export function recordDailyPlay(uid: string, now: Date = new Date()): RecordDailyPlayResult {
  const today = getLocalDateString(now);
  const stored = readDailyStreakStorage(uid);

  // First-time player or missing date
  if (!stored.lastPlayedDate) {
    const next = { streak: 1, lastPlayedDate: today };
    writeDailyStreakStorage(uid, next);
    emitDailyStreakUpdated(uid, next);
    return { updated: true, streak: next.streak, lastPlayedDate: today };
  }

  const diff = calendarDayDiff(stored.lastPlayedDate, today);
  if (diff === 0) {
    // Already recorded for today
    return { updated: false, streak: stored.streak, lastPlayedDate: stored.lastPlayedDate };
  }

  if (diff === 1) {
    const next = { streak: stored.streak + 1, lastPlayedDate: today };
    writeDailyStreakStorage(uid, next);
    emitDailyStreakUpdated(uid, next);
    return { updated: true, streak: next.streak, lastPlayedDate: today };
  }

  // diff > 1, diff < 0, or diff === null -> start a new streak today
  const next = { streak: 1, lastPlayedDate: today };
  writeDailyStreakStorage(uid, next);
  emitDailyStreakUpdated(uid, next);
  return { updated: true, streak: next.streak, lastPlayedDate: today };
}

