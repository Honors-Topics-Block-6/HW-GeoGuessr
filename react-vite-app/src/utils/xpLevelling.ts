/**
 * XP & Levelling System
 *
 * Game points are awarded as XP. Levelling uses an ever-increasing XP
 * threshold: each level costs more than the last.
 *
 * Formula (XP required to advance FROM level L to level L+1):
 *   threshold(L) = BASE_XP * L^EXPONENT
 *
 * With BASE_XP = 10 000 and EXPONENT = 1.5:
 *   Level 1 -> 2 :  10 000 XP
 *   Level 2 -> 3 :  28 284 XP
 *   Level 3 -> 4 :  51 962 XP
 *   Level 4 -> 5 :  80 000 XP
 *   Level 5 -> 6 : 111 803 XP
 *   ...and so on, always increasing.
 *
 * "Total XP" is the lifetime cumulative XP the user has earned.
 * The level is derived entirely from the total XP so we never need to
 * store the level separately -- it's a pure function of totalXp.
 */

const BASE_XP: number = 10_000;
const EXPONENT: number = 1.5;

/**
 * Information about a user's current level derived from their total XP.
 */
export interface LevelInfo {
  /** Current level (starts at 1) */
  level: number;
  /** XP threshold for current level to next level */
  currentLevelXp: number;
  /** How much XP past the current level boundary */
  xpIntoLevel: number;
  /** Remaining XP until next level */
  xpToNextLevel: number;
  /** 0-1 fraction through current level */
  progress: number;
}

/**
 * Result of an XP gain calculation.
 */
export interface XpGainResult {
  /** New cumulative total XP after gaining */
  newTotalXp: number;
  /** Level before XP was gained */
  previousLevel: number;
  /** Level after XP was gained */
  newLevel: number;
  /** Number of levels gained (0 if none) */
  levelsGained: number;
  /** Full level info at the new total XP */
  levelInfo: LevelInfo;
}

/**
 * XP required to go from `level` to `level + 1`.
 * @param level - current level (>= 1)
 * @returns XP threshold (always an integer)
 */
export function xpForNextLevel(level: number): number {
  if (level < 1) return BASE_XP;
  return Math.round(BASE_XP * Math.pow(level, EXPONENT));
}

/**
 * Cumulative XP needed to exactly reach a given level (from level 1).
 * i.e. the sum of thresholds from level 1->2, 2->3, ... (level-1)->level.
 * @param level - target level (>= 1)
 * @returns cumulative XP required
 */
export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += xpForNextLevel(l);
  }
  return total;
}

/**
 * Derive level information from a total XP value.
 * @param totalXp - lifetime cumulative XP
 * @returns level info object
 */
export function getLevelInfo(totalXp: number): LevelInfo {
  if (totalXp < 0) totalXp = 0;

  let level = 1;
  let cumulativeRequired = 0;

  while (true) {
    const threshold = xpForNextLevel(level);
    if (totalXp < cumulativeRequired + threshold) {
      const xpIntoLevel = totalXp - cumulativeRequired;
      return {
        level,
        currentLevelXp: threshold,
        xpIntoLevel,
        xpToNextLevel: threshold - xpIntoLevel,
        progress: xpIntoLevel / threshold
      };
    }
    cumulativeRequired += threshold;
    level++;
  }
}

/**
 * Calculate what happens when a user gains XP.
 * Returns the new level info plus whether a level-up occurred.
 * @param previousTotalXp - total XP before gain
 * @param xpGained - points earned this game (always >= 0)
 * @returns XP gain result
 */
export function calculateXpGain(previousTotalXp: number, xpGained: number): XpGainResult {
  const previousLevel = getLevelInfo(previousTotalXp).level;
  const newTotalXp = previousTotalXp + Math.max(0, xpGained);
  const levelInfo = getLevelInfo(newTotalXp);

  return {
    newTotalXp,
    previousLevel,
    newLevel: levelInfo.level,
    levelsGained: levelInfo.level - previousLevel,
    levelInfo
  };
}

/**
 * Human-readable level title.
 * @param level - the user's current level
 * @returns a title string
 */
export function getLevelTitle(level: number): string {
  if (level >= 50) return 'Legendary';
  if (level >= 40) return 'Master';
  if (level >= 30) return 'Expert';
  if (level >= 20) return 'Veteran';
  if (level >= 15) return 'Seasoned';
  if (level >= 10) return 'Skilled';
  if (level >= 7)  return 'Intermediate';
  if (level >= 4)  return 'Apprentice';
  if (level >= 2)  return 'Novice';
  return 'Newcomer';
}
