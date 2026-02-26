import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordDailyPlay,
  readDailyStreakStorage,
  getDisplayDailyStreak,
  syncDailyStreakRollover,
  calendarDayDiff
} from './streakService';

describe('streakService', () => {
  const uid = 'test-uid';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('computes calendar day differences (ignores time/DST)', () => {
    expect(calendarDayDiff('2026-02-24', '2026-02-24')).toBe(0);
    expect(calendarDayDiff('2026-02-24', '2026-02-25')).toBe(1);
    expect(calendarDayDiff('2026-02-24', '2026-02-26')).toBe(2);
  });

  it('starts at 1 for a first-time player when recording play', () => {
    const now = new Date(2026, 1, 24, 10, 0, 0);
    const res = recordDailyPlay(uid, now);

    expect(res.updated).toBe(true);
    expect(res.streak).toBe(1);
    expect(readDailyStreakStorage(uid)).toEqual({ streak: 1, lastPlayedDate: '2026-02-24' });
  });

  it('prevents multiple streak increases in the same day', () => {
    const morning = new Date(2026, 1, 24, 9, 0, 0);
    const night = new Date(2026, 1, 24, 23, 59, 59);

    recordDailyPlay(uid, morning);
    const res2 = recordDailyPlay(uid, night);

    expect(res2.updated).toBe(false);
    expect(readDailyStreakStorage(uid).streak).toBe(1);
  });

  it('increments by 1 when playing on the next calendar day', () => {
    recordDailyPlay(uid, new Date(2026, 1, 24, 10, 0, 0));
    const res2 = recordDailyPlay(uid, new Date(2026, 1, 25, 10, 0, 0));

    expect(res2.updated).toBe(true);
    expect(res2.streak).toBe(2);
    expect(readDailyStreakStorage(uid)).toEqual({ streak: 2, lastPlayedDate: '2026-02-25' });
  });

  it('resets display streak to 0 when a day is missed', () => {
    recordDailyPlay(uid, new Date(2026, 1, 24, 10, 0, 0));

    const display = getDisplayDailyStreak(uid, new Date(2026, 1, 26, 12, 0, 0));
    expect(display).toBe(0);

    syncDailyStreakRollover(uid, new Date(2026, 1, 26, 12, 0, 0));
    expect(readDailyStreakStorage(uid).streak).toBe(0);
  });

  it('starts a new streak at 1 after missing days and playing again', () => {
    recordDailyPlay(uid, new Date(2026, 1, 24, 10, 0, 0));
    const res2 = recordDailyPlay(uid, new Date(2026, 1, 27, 10, 0, 0));

    expect(res2.updated).toBe(true);
    expect(res2.streak).toBe(1);
    expect(readDailyStreakStorage(uid)).toEqual({ streak: 1, lastPlayedDate: '2026-02-27' });
  });
});

