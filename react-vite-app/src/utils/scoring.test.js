import { describe, it, expect } from 'vitest';

/**
 * These functions are duplicated in useGameState.js and ResultScreen.jsx
 * Testing them here as standalone utility functions
 */

// Utility functions extracted for testing
function calculateDistance(guess, actual) {
  const dx = guess.x - actual.x;
  const dy = guess.y - actual.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function calculateLocationScore(distance) {
  const maxScore = 5000;
  const decayRate = 0.05;
  const score = Math.round(maxScore * Math.exp(-decayRate * distance));
  return Math.max(0, Math.min(maxScore, score));
}

function calculateScore(distance) {
  const maxScore = 5000;
  const decayRate = 0.05;
  const score = Math.round(maxScore * Math.exp(-decayRate * distance));
  return Math.max(0, Math.min(maxScore, score));
}

function formatDistance(distance) {
  const units = Math.round(distance * 2);
  if (units < 5) return 'Perfect!';
  if (units < 20) return `${units} ft away`;
  return `${units} ft away`;
}

function getPerformanceRating(totalScore, maxPossible) {
  const percentage = (totalScore / maxPossible) * 100;
  if (percentage >= 95) return { rating: 'Perfect!', emoji: '🏆', class: 'perfect' };
  if (percentage >= 80) return { rating: 'Excellent!', emoji: '🌟', class: 'excellent' };
  if (percentage >= 60) return { rating: 'Great!', emoji: '👏', class: 'great' };
  if (percentage >= 40) return { rating: 'Good', emoji: '👍', class: 'good' };
  if (percentage >= 20) return { rating: 'Keep Practicing', emoji: '📍', class: 'okay' };
  return { rating: 'Beginner', emoji: '🎯', class: 'beginner' };
}

describe('scoring utilities', () => {
  describe('calculateDistance', () => {
    it('should return 0 for identical points', () => {
      const distance = calculateDistance({ x: 50, y: 50 }, { x: 50, y: 50 });
      expect(distance).toBe(0);
    });

    it('should calculate horizontal distance correctly', () => {
      const distance = calculateDistance({ x: 10, y: 50 }, { x: 20, y: 50 });
      expect(distance).toBe(10);
    });

    it('should calculate vertical distance correctly', () => {
      const distance = calculateDistance({ x: 50, y: 10 }, { x: 50, y: 20 });
      expect(distance).toBe(10);
    });

    it('should calculate diagonal distance correctly (3-4-5 triangle)', () => {
      const distance = calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(distance).toBe(5);
    });

    it('should handle negative coordinates', () => {
      const distance = calculateDistance({ x: -10, y: -10 }, { x: 0, y: 0 });
      expect(distance).toBeCloseTo(14.14, 1);
    });

    it('should handle decimal coordinates', () => {
      const distance = calculateDistance({ x: 0.5, y: 0.5 }, { x: 1.5, y: 1.5 });
      expect(distance).toBeCloseTo(1.41, 1);
    });

    it('should be symmetric', () => {
      const d1 = calculateDistance({ x: 10, y: 20 }, { x: 30, y: 40 });
      const d2 = calculateDistance({ x: 30, y: 40 }, { x: 10, y: 20 });
      expect(d1).toBe(d2);
    });

    it('should calculate maximum diagonal distance on 100x100 grid', () => {
      const distance = calculateDistance({ x: 0, y: 0 }, { x: 100, y: 100 });
      expect(distance).toBeCloseTo(141.42, 1);
    });
  });

  describe('calculateLocationScore', () => {
    it('should return 5000 for distance 0', () => {
      const score = calculateLocationScore(0);
      expect(score).toBe(5000);
    });

    it('should return less than 5000 for any non-zero distance', () => {
      const score = calculateLocationScore(1);
      expect(score).toBeLessThan(5000);
    });

    it('should return at least 0', () => {
      const score = calculateLocationScore(1000);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should cap at 5000', () => {
      const score = calculateLocationScore(-10); // Negative distance (edge case)
      expect(score).toBeLessThanOrEqual(5000);
    });

    it('should decrease score with increasing distance', () => {
      const score10 = calculateLocationScore(10);
      const score20 = calculateLocationScore(20);
      const score30 = calculateLocationScore(30);

      expect(score10).toBeGreaterThan(score20);
      expect(score20).toBeGreaterThan(score30);
    });

    it('should use exponential decay (score at 10 units)', () => {
      const score = calculateLocationScore(10);
      // Expected: 5000 * e^(-0.05 * 10) = 5000 * e^(-0.5) ≈ 3033
      expect(score).toBeCloseTo(3033, -2);
    });

    it('should use exponential decay (score at 20 units)', () => {
      const score = calculateLocationScore(20);
      // Expected: 5000 * e^(-0.05 * 20) = 5000 * e^(-1) ≈ 1839
      expect(score).toBeCloseTo(1839, -2);
    });

    it('should return integer values', () => {
      const score = calculateLocationScore(15);
      expect(Number.isInteger(score)).toBe(true);
    });
  });

  describe('calculateScore (alias)', () => {
    it('should behave identically to calculateLocationScore', () => {
      for (let d = 0; d <= 100; d += 10) {
        expect(calculateScore(d)).toBe(calculateLocationScore(d));
      }
    });
  });

  describe('formatDistance', () => {
    it('should return "Perfect!" for distance < 2.5', () => {
      expect(formatDistance(0)).toBe('Perfect!');
      expect(formatDistance(1)).toBe('Perfect!');
      expect(formatDistance(2)).toBe('Perfect!');
    });

    it('should return feet away for small distances', () => {
      expect(formatDistance(5)).toBe('10 ft away');
      expect(formatDistance(7)).toBe('14 ft away');
    });

    it('should return feet away for larger distances', () => {
      expect(formatDistance(25)).toBe('50 ft away');
      expect(formatDistance(50)).toBe('100 ft away');
    });

    it('should round distance properly', () => {
      // 2.5 * 2 = 5, should show as feet
      expect(formatDistance(2.5)).toBe('5 ft away');
    });
  });

  describe('getPerformanceRating', () => {
    const maxScore = 25000; // 5 rounds * 5000 points

    it('should return Perfect for 95%+ score', () => {
      const rating = getPerformanceRating(24000, maxScore);
      expect(rating.rating).toBe('Perfect!');
      expect(rating.emoji).toBe('🏆');
      expect(rating.class).toBe('perfect');
    });

    it('should return Excellent for 80-94% score', () => {
      const rating = getPerformanceRating(22000, maxScore);
      expect(rating.rating).toBe('Excellent!');
      expect(rating.emoji).toBe('🌟');
      expect(rating.class).toBe('excellent');
    });

    it('should return Great for 60-79% score', () => {
      const rating = getPerformanceRating(17500, maxScore);
      expect(rating.rating).toBe('Great!');
      expect(rating.emoji).toBe('👏');
      expect(rating.class).toBe('great');
    });

    it('should return Good for 40-59% score', () => {
      const rating = getPerformanceRating(12500, maxScore);
      expect(rating.rating).toBe('Good');
      expect(rating.emoji).toBe('👍');
      expect(rating.class).toBe('good');
    });

    it('should return Keep Practicing for 20-39% score', () => {
      const rating = getPerformanceRating(7500, maxScore);
      expect(rating.rating).toBe('Keep Practicing');
      expect(rating.emoji).toBe('📍');
      expect(rating.class).toBe('okay');
    });

    it('should return Beginner for < 20% score', () => {
      const rating = getPerformanceRating(2000, maxScore);
      expect(rating.rating).toBe('Beginner');
      expect(rating.emoji).toBe('🎯');
      expect(rating.class).toBe('beginner');
    });

    it('should return Beginner for 0 score', () => {
      const rating = getPerformanceRating(0, maxScore);
      expect(rating.rating).toBe('Beginner');
    });

    it('should return Perfect for max score', () => {
      const rating = getPerformanceRating(maxScore, maxScore);
      expect(rating.rating).toBe('Perfect!');
    });

    it('should handle edge case at exactly 95%', () => {
      const rating = getPerformanceRating(23750, maxScore); // Exactly 95%
      expect(rating.rating).toBe('Perfect!');
    });

    it('should handle edge case at exactly 80%', () => {
      const rating = getPerformanceRating(20000, maxScore); // Exactly 80%
      expect(rating.rating).toBe('Excellent!');
    });
  });

  describe('floor scoring', () => {
    it('should apply 0.8 multiplier for wrong floor', () => {
      const locationScore = 5000;
      const totalWithWrongFloor = Math.round(locationScore * 0.8);
      expect(totalWithWrongFloor).toBe(4000);
    });

    it('should give full score for correct floor', () => {
      const locationScore = 5000;
      const floorCorrect = true;
      const totalScore = floorCorrect ? locationScore : Math.round(locationScore * 0.8);
      expect(totalScore).toBe(5000);
    });

    it('should calculate floor penalty correctly', () => {
      const locationScore = 3500;
      const floorCorrect = false;
      const totalScore = floorCorrect ? locationScore : Math.round(locationScore * 0.8);
      const floorPenalty = floorCorrect ? 0 : Math.round(locationScore * 0.2);

      expect(totalScore).toBe(2800);
      expect(floorPenalty).toBe(700);
    });
  });
});
