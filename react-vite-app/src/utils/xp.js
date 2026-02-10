/**
 * XP and leveling utilities (placeholder formulas; replace when tuning).
 *
 * Firestore shape (for reference; not used in this outline):
 *   users/{uid}: { xp: number, ... } or userProgress/{uid}: { xp: number }
 * Award sources (for later): 'round_complete' | 'game_complete' | 'pvp_win'
 */

/** XP granted per round completed (placeholder). */
export const XP_PER_ROUND = 10;

/** Bonus XP for finishing a full game (placeholder). */
export const XP_GAME_COMPLETE_BONUS = 50;

/** XP required to reach each level (placeholder). Level 1 = 0, level 2 = 100, etc. */
const XP_PER_LEVEL = 100;

/**
 * Convert total XP to level number (placeholder: linear).
 * @param {number} xp - Total XP
 * @returns {number} Level (1-based)
 */
export function xpToLevel(xp) {
  if (xp <= 0) return 1;
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/**
 * Get level progress for UI (progress bar).
 * @param {number} xp - Total XP
 * @returns {{ level: number, xpInCurrentLevel: number, xpToNextLevel: number, progressFraction: number }}
 */
export function getLevelProgress(xp) {
  const level = xpToLevel(xp);
  const xpForCurrentLevel = (level - 1) * XP_PER_LEVEL;
  const xpInCurrentLevel = xp - xpForCurrentLevel;
  const xpToNextLevel = XP_PER_LEVEL;
  const progressFraction = Math.min(1, xpInCurrentLevel / xpToNextLevel);
  return {
    level,
    xpInCurrentLevel,
    xpToNextLevel,
    progressFraction
  };
}
