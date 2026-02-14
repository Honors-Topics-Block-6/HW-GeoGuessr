import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getOrCreateDailyGoals,
  recordGoalProgress,
  markBonusXpAwarded
} from '../services/dailyGoalsService';
import { awardXp } from '../services/xpService';
import { GOAL_TYPES } from '../utils/dailyGoalDefinitions';

/**
 * Hook for managing daily goals state.
 *
 * @param {string|null} uid — Current user's UID (null when logged out)
 * @returns {{ goals, allCompleted, bonusXpAwarded, bonusXpAmount, loading, error, refreshGoals, recordProgress, claimBonusXp, GOAL_TYPES }}
 */
export function useDailyGoals(uid) {
  const [goalsData, setGoalsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch/create goals on mount and when uid changes
  const refreshGoals = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrCreateDailyGoals(uid);
      setGoalsData(data);
    } catch (err) {
      console.error('Failed to load daily goals:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refreshGoals();
  }, [refreshGoals]);

  /**
   * Record progress toward a goal type.
   * Called by integration points (FinalResultsScreen, DuelFinalScreen, etc.)
   */
  const recordProgress = useCallback(async (goalType, value = 1, params = {}) => {
    if (!uid) return;
    try {
      const result = await recordGoalProgress(uid, goalType, value, params);
      if (result.updated) {
        // Refresh local state to reflect changes
        await refreshGoals();
      }
      return result;
    } catch (err) {
      console.error('Failed to record goal progress:', err);
    }
  }, [uid, refreshGoals]);

  /**
   * Claim the bonus XP when all goals are completed.
   * Awards the XP and marks it as claimed in Firestore.
   */
  const claimBonusXp = useCallback(async () => {
    if (!uid || !goalsData?.allCompleted || goalsData?.bonusXpAwarded) return;
    try {
      await awardXp(uid, goalsData.bonusXpAmount);
      await markBonusXpAwarded(uid);
      await refreshGoals();
      return goalsData.bonusXpAmount;
    } catch (err) {
      console.error('Failed to claim bonus XP:', err);
      setError(err.message);
    }
  }, [uid, goalsData, refreshGoals]);

  // Derived state
  const goals = goalsData?.goals || [];
  const allCompleted = goalsData?.allCompleted || false;
  const bonusXpAwarded = goalsData?.bonusXpAwarded || false;
  const bonusXpAmount = goalsData?.bonusXpAmount || 0;

  return useMemo(() => ({
    goals,
    allCompleted,
    bonusXpAwarded,
    bonusXpAmount,
    loading,
    error,
    refreshGoals,
    recordProgress,
    claimBonusXp,
    GOAL_TYPES
  }), [goals, allCompleted, bonusXpAwarded, bonusXpAmount, loading, error, refreshGoals, recordProgress, claimBonusXp]);
}
