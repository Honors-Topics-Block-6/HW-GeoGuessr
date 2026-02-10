/**
 * XP service (placeholder: no Firestore). Later: getUserXp reads from users/{uid}, awardXp calls Cloud Function or updates Firestore.
 */

/**
 * Get user's total XP (placeholder: returns 0 or mock).
 * @param {string} uid - User ID (ignored for now)
 * @returns {Promise<number>}
 */
export async function getUserXp(uid) {
  if (!uid) return 0;
  // Placeholder: no Firestore read yet
  return 0;
}

/**
 * Award XP for an action (placeholder: no-op / log only).
 * @param {string} uid - User ID
 * @param {string} source - 'round_complete' | 'game_complete' | 'pvp_win'
 * @param {number} amount - XP amount
 */
export function awardXp(uid, source, amount) {
  // Placeholder: later call Cloud Function or update Firestore
  if (uid && amount > 0) {
    console.log('[XP placeholder] awardXp', { uid, source, amount });
  }
}
