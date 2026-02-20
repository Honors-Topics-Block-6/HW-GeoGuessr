import { describe, it, expect } from 'vitest';
import type { BuildingStat } from '../contexts/AuthContext';
import { getFavoriteAndWorstBuildings } from './buildingStats';

const buildStats = (entries: Array<[string, BuildingStat]>): Record<string, BuildingStat> => (
  Object.fromEntries(entries)
);

describe('getFavoriteAndWorstBuildings', () => {
  it('breaks ties by higher count, then alphabetical', () => {
    const stats = buildStats([
      ['alpha::1', { building: 'Alpha', floor: 1, totalScore: 90, count: 1 }],
      ['beta::2', { building: 'Beta', floor: 2, totalScore: 270, count: 3 }],
      ['gamma::1', { building: 'Gamma', floor: 1, totalScore: 20, count: 2 }],
      ['delta::1', { building: 'Delta', floor: 1, totalScore: 50, count: 5 }],
    ]);

    const result = getFavoriteAndWorstBuildings(stats);
    expect(result.favoriteBuilding).toBe('Beta (Floor 2)');
    expect(result.worstBuilding).toBe('Delta (Floor 1)');
  });

  it('uses alphabetical order when average and count are equal', () => {
    const stats = buildStats([
      ['bravo::1', { building: 'Bravo', floor: 1, totalScore: 100, count: 2 }],
      ['alpha::1', { building: 'Alpha', floor: 1, totalScore: 100, count: 2 }],
      ['charlie::2', { building: 'Charlie', floor: 2, totalScore: 50, count: 1 }],
    ]);

    const result = getFavoriteAndWorstBuildings(stats);
    expect(result.favoriteBuilding).toBe('Alpha (Floor 1)');
    expect(result.worstBuilding).toBe('Charlie (Floor 2)');
  });

  it('returns N/A when there are no valid buildings', () => {
    const stats = buildStats([
      ['unknown::1', { building: 'Unknown', floor: 1, totalScore: 100, count: 2 }],
      ['file::1', { building: 'image.png', floor: 1, totalScore: 50, count: 1 }],
      ['blank::1', { building: '', floor: 1, totalScore: 40, count: 1 }],
    ]);

    const result = getFavoriteAndWorstBuildings(stats);
    expect(result.favoriteBuilding).toBe('N/A');
    expect(result.worstBuilding).toBe('N/A');
  });
});

