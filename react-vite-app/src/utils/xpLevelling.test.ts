import { describe, it, expect } from 'vitest';
import {
  xpForNextLevel,
  cumulativeXpForLevel,
  getLevelInfo,
  calculateXpGain,
  getLevelTitle
} from './xpLevelling';

describe('XP & Levelling System', () => {
  describe('xpForNextLevel', () => {
    it('should require 10,000 XP to go from level 1 to level 2', () => {
      expect(xpForNextLevel(1)).toBe(10_000);
    });

    it('should require more XP for higher levels', () => {
      const lvl1 = xpForNextLevel(1);
      const lvl2 = xpForNextLevel(2);
      const lvl3 = xpForNextLevel(3);
      const lvl5 = xpForNextLevel(5);

      expect(lvl2).toBeGreaterThan(lvl1);
      expect(lvl3).toBeGreaterThan(lvl2);
      expect(lvl5).toBeGreaterThan(lvl3);
    });

    it('should always return a positive integer', () => {
      for (let level = 1; level <= 50; level++) {
        const xp = xpForNextLevel(level);
        expect(xp).toBeGreaterThan(0);
        expect(Number.isInteger(xp)).toBe(true);
      }
    });

    it('should use the formula BASE_XP * level^1.5', () => {
      // Level 2 → 3: 10000 * 2^1.5 = 10000 * 2.828... ≈ 28284
      expect(xpForNextLevel(2)).toBe(Math.round(10_000 * Math.pow(2, 1.5)));
      // Level 4 → 5: 10000 * 4^1.5 = 10000 * 8 = 80000
      expect(xpForNextLevel(4)).toBe(80_000);
    });

    it('should handle level < 1 gracefully', () => {
      expect(xpForNextLevel(0)).toBe(10_000);
      expect(xpForNextLevel(-1)).toBe(10_000);
    });
  });

  describe('cumulativeXpForLevel', () => {
    it('should return 0 for level 1', () => {
      expect(cumulativeXpForLevel(1)).toBe(0);
    });

    it('should return 10,000 for level 2', () => {
      expect(cumulativeXpForLevel(2)).toBe(10_000);
    });

    it('should accumulate thresholds correctly', () => {
      // Level 3 = xpForNextLevel(1) + xpForNextLevel(2)
      const expected = xpForNextLevel(1) + xpForNextLevel(2);
      expect(cumulativeXpForLevel(3)).toBe(expected);
    });

    it('should always increase', () => {
      let prev = 0;
      for (let level = 2; level <= 20; level++) {
        const cumulative = cumulativeXpForLevel(level);
        expect(cumulative).toBeGreaterThan(prev);
        prev = cumulative;
      }
    });

    it('should return 0 for levels <= 1', () => {
      expect(cumulativeXpForLevel(0)).toBe(0);
      expect(cumulativeXpForLevel(-5)).toBe(0);
    });
  });

  describe('getLevelInfo', () => {
    it('should return level 1 for 0 XP', () => {
      const info = getLevelInfo(0);
      expect(info.level).toBe(1);
      expect(info.xpIntoLevel).toBe(0);
      expect(info.progress).toBe(0);
    });

    it('should return level 1 for 5,000 XP (halfway through first level)', () => {
      const info = getLevelInfo(5000);
      expect(info.level).toBe(1);
      expect(info.xpIntoLevel).toBe(5000);
      expect(info.currentLevelXp).toBe(10_000);
      expect(info.xpToNextLevel).toBe(5000);
      expect(info.progress).toBe(0.5);
    });

    it('should return level 2 for exactly 10,000 XP', () => {
      const info = getLevelInfo(10_000);
      expect(info.level).toBe(2);
      expect(info.xpIntoLevel).toBe(0);
    });

    it('should return level 2 for 15,000 XP', () => {
      const info = getLevelInfo(15_000);
      expect(info.level).toBe(2);
      expect(info.xpIntoLevel).toBe(5000);
    });

    it('should handle negative XP gracefully', () => {
      const info = getLevelInfo(-100);
      expect(info.level).toBe(1);
      expect(info.xpIntoLevel).toBe(0);
    });

    it('should have progress between 0 and 1', () => {
      for (const xp of [0, 1000, 5000, 9999, 10000, 25000, 100000]) {
        const info = getLevelInfo(xp);
        expect(info.progress).toBeGreaterThanOrEqual(0);
        expect(info.progress).toBeLessThan(1);
      }
    });

    it('xpIntoLevel + xpToNextLevel should equal currentLevelXp', () => {
      for (const xp of [0, 500, 9999, 10000, 15000, 38284, 100000]) {
        const info = getLevelInfo(xp);
        expect(info.xpIntoLevel + info.xpToNextLevel).toBe(info.currentLevelXp);
      }
    });

    it('should handle very large XP values', () => {
      const info = getLevelInfo(10_000_000);
      expect(info.level).toBeGreaterThan(10);
      expect(info.xpIntoLevel).toBeGreaterThanOrEqual(0);
      expect(info.progress).toBeGreaterThanOrEqual(0);
      expect(info.progress).toBeLessThan(1);
    });
  });

  describe('calculateXpGain', () => {
    it('should correctly calculate new total XP', () => {
      const result = calculateXpGain(0, 5000);
      expect(result.newTotalXp).toBe(5000);
    });

    it('should detect no level-up when staying in same level', () => {
      const result = calculateXpGain(0, 5000);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBe(1);
      expect(result.levelsGained).toBe(0);
    });

    it('should detect a level-up from 1 to 2', () => {
      // Starting at 5000 XP (level 1), gaining 6000 → total 11000 (level 2)
      const result = calculateXpGain(5000, 6000);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBe(2);
      expect(result.levelsGained).toBe(1);
      expect(result.newTotalXp).toBe(11000);
    });

    it('should detect multiple level-ups', () => {
      // Starting from 0, gaining 50000 XP should get past level 1 (10k) and level 2 (28284)
      // cumulative for level 3 = 10000 + 28284 = 38284
      const result = calculateXpGain(0, 50000);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBeGreaterThanOrEqual(3);
      expect(result.levelsGained).toBeGreaterThanOrEqual(2);
    });

    it('should not gain XP for negative values', () => {
      const result = calculateXpGain(5000, -1000);
      expect(result.newTotalXp).toBe(5000);
      expect(result.levelsGained).toBe(0);
    });

    it('should handle 0 XP gain', () => {
      const result = calculateXpGain(10000, 0);
      expect(result.newTotalXp).toBe(10000);
      expect(result.newLevel).toBe(2);
    });

    it('should include levelInfo in result', () => {
      const result = calculateXpGain(0, 15000);
      expect(result.levelInfo).toBeDefined();
      expect(result.levelInfo.level).toBe(2);
      expect(result.levelInfo.xpIntoLevel).toBe(5000);
    });
  });

  describe('getLevelTitle', () => {
    it('should return "Newcomer" for level 1', () => {
      expect(getLevelTitle(1)).toBe('Newcomer');
    });

    it('should return "Novice" for level 2-3', () => {
      expect(getLevelTitle(2)).toBe('Novice');
      expect(getLevelTitle(3)).toBe('Novice');
    });

    it('should return "Apprentice" for level 4-6', () => {
      expect(getLevelTitle(4)).toBe('Apprentice');
      expect(getLevelTitle(6)).toBe('Apprentice');
    });

    it('should return "Intermediate" for level 7-9', () => {
      expect(getLevelTitle(7)).toBe('Intermediate');
      expect(getLevelTitle(9)).toBe('Intermediate');
    });

    it('should return "Skilled" for level 10-14', () => {
      expect(getLevelTitle(10)).toBe('Skilled');
      expect(getLevelTitle(14)).toBe('Skilled');
    });

    it('should return "Seasoned" for level 15-19', () => {
      expect(getLevelTitle(15)).toBe('Seasoned');
      expect(getLevelTitle(19)).toBe('Seasoned');
    });

    it('should return "Veteran" for level 20-29', () => {
      expect(getLevelTitle(20)).toBe('Veteran');
      expect(getLevelTitle(29)).toBe('Veteran');
    });

    it('should return "Expert" for level 30-39', () => {
      expect(getLevelTitle(30)).toBe('Expert');
      expect(getLevelTitle(39)).toBe('Expert');
    });

    it('should return "Master" for level 40-49', () => {
      expect(getLevelTitle(40)).toBe('Master');
      expect(getLevelTitle(49)).toBe('Master');
    });

    it('should return "Legendary" for level 50+', () => {
      expect(getLevelTitle(50)).toBe('Legendary');
      expect(getLevelTitle(100)).toBe('Legendary');
    });
  });

  describe('integration: level thresholds are ever-increasing', () => {
    it('every level should cost more XP than the previous one', () => {
      let previousThreshold = 0;
      for (let level = 1; level <= 100; level++) {
        const threshold = xpForNextLevel(level);
        expect(threshold).toBeGreaterThan(previousThreshold);
        previousThreshold = threshold;
      }
    });

    it('getLevelInfo should be consistent with cumulativeXpForLevel', () => {
      for (let level = 1; level <= 20; level++) {
        const cumulative = cumulativeXpForLevel(level);
        const info = getLevelInfo(cumulative);
        expect(info.level).toBe(level);
        expect(info.xpIntoLevel).toBe(0);
      }
    });
  });
});
