import { describe, it, expect } from 'vitest';
import {
  GOAL_POOL,
  GOAL_TYPES,
  DAILY_GOALS_COUNT,
  DAILY_GOALS_BONUS_XP,
  selectRandomGoals
} from './dailyGoalDefinitions';

describe('dailyGoalDefinitions', () => {
  describe('GOAL_POOL', () => {
    it('should have no duplicate IDs', () => {
      const ids = GOAL_POOL.map(g => g.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have all required fields on every goal', () => {
      for (const goal of GOAL_POOL) {
        expect(goal).toHaveProperty('id');
        expect(goal).toHaveProperty('description');
        expect(goal).toHaveProperty('type');
        expect(goal).toHaveProperty('target');
        expect(typeof goal.id).toBe('string');
        expect(typeof goal.description).toBe('string');
        expect(typeof goal.type).toBe('string');
        expect(typeof goal.target).toBe('number');
        expect(goal.target).toBeGreaterThan(0);
      }
    });

    it('should only use valid goal types', () => {
      const validTypes = Object.values(GOAL_TYPES);
      for (const goal of GOAL_POOL) {
        expect(validTypes).toContain(goal.type);
      }
    });

    it('should have enough goals in the pool', () => {
      expect(GOAL_POOL.length).toBeGreaterThanOrEqual(DAILY_GOALS_COUNT);
    });
  });

  describe('constants', () => {
    it('should have a positive bonus XP amount', () => {
      expect(DAILY_GOALS_BONUS_XP).toBeGreaterThan(0);
    });

    it('should have a positive daily goals count', () => {
      expect(DAILY_GOALS_COUNT).toBeGreaterThan(0);
    });
  });

  describe('selectRandomGoals', () => {
    it('should return the default number of goals', () => {
      const goals = selectRandomGoals();
      expect(goals).toHaveLength(DAILY_GOALS_COUNT);
    });

    it('should return the requested number of goals', () => {
      const goals = selectRandomGoals(2);
      expect(goals).toHaveLength(2);
    });

    it('should return goals with unique types when possible', () => {
      // Run multiple times to account for randomness
      for (let i = 0; i < 20; i++) {
        const goals = selectRandomGoals(3);
        const types = goals.map(g => g.type);
        const uniqueTypes = new Set(types);
        // With 7 unique types in the pool, 3 should always have unique types
        expect(uniqueTypes.size).toBe(3);
      }
    });

    it('should return valid goal objects', () => {
      const goals = selectRandomGoals();
      for (const goal of goals) {
        expect(goal).toHaveProperty('id');
        expect(goal).toHaveProperty('description');
        expect(goal).toHaveProperty('type');
        expect(goal).toHaveProperty('target');
      }
    });

    it('should not return more goals than requested', () => {
      const goals = selectRandomGoals(1);
      expect(goals).toHaveLength(1);
    });

    it('should handle requesting more goals than the pool size', () => {
      const goals = selectRandomGoals(100);
      // Should return at most the pool size
      expect(goals.length).toBeLessThanOrEqual(GOAL_POOL.length);
      // Should return at least the number of unique IDs
      expect(goals.length).toBeGreaterThan(0);
    });

    it('should return different selections across calls (randomness)', () => {
      const selections = new Set<string>();
      // Run 20 times and collect the first goal ID
      for (let i = 0; i < 20; i++) {
        const goals = selectRandomGoals(3);
        selections.add(goals.map(g => g.id).sort().join(','));
      }
      // Should have at least 2 different combinations (very likely with random)
      expect(selections.size).toBeGreaterThan(1);
    });
  });
});
