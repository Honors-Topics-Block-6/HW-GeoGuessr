/**
 * Compute the time-based score multiplier.
 * Faster guesses get full score; slower guesses are penalized linearly.
 * At 0s → 1.0x, at round end → minMultiplier.
 *
 * Used by: duel (multiplayer) and hard mode singleplayer.
 */
export function computeTimeMultiplier(
  timeTakenSeconds: number,
  roundTimeSeconds: number,
  minMultiplier: number = 0.5
): number {
  const clamped = Math.max(0, Math.min(roundTimeSeconds, timeTakenSeconds));
  return Math.max(
    minMultiplier,
    1 - (1 - minMultiplier) * (clamped / roundTimeSeconds)
  );
}
