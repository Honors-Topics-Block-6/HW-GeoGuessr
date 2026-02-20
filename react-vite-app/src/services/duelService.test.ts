import { describe, it, expect, vi } from 'vitest';

// Mock Firebase before importing the service
vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: vi.fn(() => ({ toMillis: () => Date.now() })) }
}));

import { computeTimeMultiplier } from '../utils/timeScoring';
import {
  DUEL_ROUND_TIME_SECONDS,
  DUEL_TIME_MIN_MULTIPLIER
} from './duelService';

describe('duelService', () => {
  describe('computeTimeMultiplier', () => {
    it('should return 1.0 at 0 seconds', () => {
      expect(computeTimeMultiplier(0, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER)).toBe(1);
    });

    it('should return MIN_MULTIPLIER at round end (20s)', () => {
      expect(computeTimeMultiplier(DUEL_ROUND_TIME_SECONDS, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER)).toBe(DUEL_TIME_MIN_MULTIPLIER);
    });

    it('should return 0.75 at halfway (10s)', () => {
      const halfway = DUEL_ROUND_TIME_SECONDS / 2;
      expect(computeTimeMultiplier(halfway, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER)).toBeCloseTo(0.75, 5);
    });

    it('should clamp negative time to 0 (full multiplier)', () => {
      expect(computeTimeMultiplier(-5, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER)).toBe(1);
    });

    it('should clamp time beyond round limit to min multiplier', () => {
      expect(computeTimeMultiplier(DUEL_ROUND_TIME_SECONDS + 10, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER)).toBe(DUEL_TIME_MIN_MULTIPLIER);
    });

    it('should decrease linearly between 0 and round time', () => {
      const at5 = computeTimeMultiplier(5, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER);
      const at10 = computeTimeMultiplier(10, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER);
      const at15 = computeTimeMultiplier(15, DUEL_ROUND_TIME_SECONDS, DUEL_TIME_MIN_MULTIPLIER);
      expect(at5).toBeGreaterThan(at10);
      expect(at10).toBeGreaterThan(at15);
      expect(at15).toBeGreaterThan(DUEL_TIME_MIN_MULTIPLIER);
    });
  });
});
