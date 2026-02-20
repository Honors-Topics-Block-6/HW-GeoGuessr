import { describe, it, expect } from 'vitest';
import { computeTimeMultiplier } from './timeScoring';

describe('timeScoring', () => {
  describe('computeTimeMultiplier', () => {
    const ROUND_TIME = 20;
    const MIN_MULTIPLIER = 0.5;

    it('should return 1.0 at 0 seconds', () => {
      expect(computeTimeMultiplier(0, ROUND_TIME, MIN_MULTIPLIER)).toBe(1);
    });

    it('should return minMultiplier at round end', () => {
      expect(computeTimeMultiplier(ROUND_TIME, ROUND_TIME, MIN_MULTIPLIER)).toBe(MIN_MULTIPLIER);
    });

    it('should return 0.75 at halfway', () => {
      expect(computeTimeMultiplier(10, ROUND_TIME, MIN_MULTIPLIER)).toBeCloseTo(0.75, 5);
    });

    it('should clamp negative time to 0', () => {
      expect(computeTimeMultiplier(-5, ROUND_TIME, MIN_MULTIPLIER)).toBe(1);
    });

    it('should clamp time beyond round limit', () => {
      expect(computeTimeMultiplier(ROUND_TIME + 10, ROUND_TIME, MIN_MULTIPLIER)).toBe(MIN_MULTIPLIER);
    });

    it('should use default minMultiplier of 0.5 when omitted', () => {
      expect(computeTimeMultiplier(ROUND_TIME, ROUND_TIME)).toBe(0.5);
    });
  });
});
