import { describe, it, expect } from 'vitest';
import { formatPointsShort, formatPointsWithCommas, generateShareableResultsText } from './shareResults';

describe('shareResults', () => {
  describe('formatPointsWithCommas', () => {
    it('formats totals with commas', () => {
      expect(formatPointsWithCommas(18402)).toBe('18,402');
      expect(formatPointsWithCommas(0)).toBe('0');
    });
  });

  describe('formatPointsShort', () => {
    it('uses plain numbers under 1000', () => {
      expect(formatPointsShort(150)).toBe('150');
      expect(formatPointsShort(999)).toBe('999');
    });

    it('uses k formatting for thousands', () => {
      expect(formatPointsShort(1000)).toBe('1k');
      expect(formatPointsShort(4200)).toBe('4.2k');
      expect(formatPointsShort(4000)).toBe('4k');
      expect(formatPointsShort(3800)).toBe('3.8k');
    });
  });

  describe('generateShareableResultsText', () => {
    it('generates a shareable multi-line summary', () => {
      const text = generateShareableResultsText({
        gameName: 'My GeoGuessr',
        rounds: [
          { roundNumber: 1, score: 4200 },
          { roundNumber: 2, score: 150 },
        ],
      });

      expect(text).toContain('🌍 My GeoGuessr Score: 4,350');
      expect(text).toContain('📍 Round 1: 🚩 4.2k points');
      expect(text).toContain('📍 Round 2: 🚩 150 points');
    });
  });
});

