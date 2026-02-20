import type { BuildingStat } from '../contexts/AuthContext';

const FILENAME_REGEX = /\.(jpe?g|png|gif|webp)$/i;
const UNKNOWN_BUILDING = 'Unknown';
const NOT_AVAILABLE = 'N/A';

export interface FavoriteWorstBuildingResult {
  favoriteBuilding: string;
  worstBuilding: string;
}

const normalizeBuildingLabel = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed === UNKNOWN_BUILDING) return null;
  if (FILENAME_REGEX.test(trimmed)) return null;
  return trimmed;
};

const formatBuilding = (entry: BuildingStat): string => {
  const buildingLabel = normalizeBuildingLabel(entry.building);
  if (!buildingLabel) return NOT_AVAILABLE;
  const floorLabel = entry.floor !== null && entry.floor !== undefined ? `Floor ${entry.floor}` : 'Floor N/A';
  return `${buildingLabel} (${floorLabel})`;
};

const getAverageScore = (entry: BuildingStat): number => (
  entry.count > 0 ? entry.totalScore / entry.count : 0
);

const preferAlphabetical = (a: BuildingStat, b: BuildingStat): boolean => {
  const labelA = normalizeBuildingLabel(a.building) ?? '';
  const labelB = normalizeBuildingLabel(b.building) ?? '';
  return labelA.localeCompare(labelB, 'en', { sensitivity: 'base' }) < 0;
};

const isBetterForFavorite = (candidate: BuildingStat, current: BuildingStat): boolean => {
  const candidateAvg = getAverageScore(candidate);
  const currentAvg = getAverageScore(current);
  if (candidateAvg !== currentAvg) return candidateAvg > currentAvg;
  if (candidate.count !== current.count) return candidate.count > current.count;
  return preferAlphabetical(candidate, current);
};

const isBetterForWorst = (candidate: BuildingStat, current: BuildingStat): boolean => {
  const candidateAvg = getAverageScore(candidate);
  const currentAvg = getAverageScore(current);
  if (candidateAvg !== currentAvg) return candidateAvg < currentAvg;
  if (candidate.count !== current.count) return candidate.count > current.count;
  return preferAlphabetical(candidate, current);
};

export const getFavoriteAndWorstBuildings = (
  buildingStats: Record<string, BuildingStat> | null | undefined
): FavoriteWorstBuildingResult => {
  const entries = Object.values(buildingStats ?? {}).filter(entry => !!normalizeBuildingLabel(entry.building));
  if (entries.length === 0) {
    return { favoriteBuilding: NOT_AVAILABLE, worstBuilding: NOT_AVAILABLE };
  }

  let favorite = entries[0];
  let worst = entries[0];

  for (const entry of entries) {
    if (isBetterForFavorite(entry, favorite)) {
      favorite = entry;
    }
    if (isBetterForWorst(entry, worst)) {
      worst = entry;
    }
  }

  return {
    favoriteBuilding: formatBuilding(favorite),
    worstBuilding: formatBuilding(worst)
  };
};

