import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  getOrCreateDailyGoals,
  recordGoalProgress,
  markBonusXpAwarded,
  getTodayDateString
} from '../services/dailyGoalsService';
import { awardBonusXp } from '../services/xpService';
import { GOAL_TYPES } from '../utils/dailyGoalDefinitions';

export interface DailyGoal {
  id: string;
  description: string;
  type: string;
  target: number;
  current: number;
  completed: boolean;
  isThreshold?: boolean;
  targetDifficulty?: string;
  [key: string]: unknown;
}

export interface DailyGoalsData {
  uid: string;
  date: string;
  goals: DailyGoal[];
  allCompleted: boolean;
  bonusXpAwarded: boolean;
  bonusXpAmount: number;
  createdAt: unknown;
  completedAt: unknown;
}

export interface RecordProgressResult {
  updated: boolean;
  allCompleted: boolean;
}

export interface RecordProgressParams {
  targetDifficulty?: string;
  [key: string]: string | undefined;
}

export interface UseDailyGoalsReturn {
  goals: DailyGoal[];
  allCompleted: boolean;
  bonusXpAwarded: boolean;
  bonusXpAmount: number;
  loading: boolean;
  error: string | null;
  refreshGoals: () => Promise<void>;
  recordProgress: (goalType: string, value?: number, params?: RecordProgressParams) => Promise<RecordProgressResult | undefined>;
  claimBonusXp: () => Promise<number | undefined>;
  GOAL_TYPES: typeof GOAL_TYPES;
}

/**
 * Hook for managing daily goals state.
 */
export function useDailyGoals(uid: string | null): UseDailyGoalsReturn {
  const [goalsData, setGoalsData] = useState<DailyGoalsData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch/create goals on mount and when uid changes
  const refreshGoals = useCallback(async (): Promise<void> => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrCreateDailyGoals(uid);
      setGoalsData(data);
    } catch (err) {
      console.error('Failed to load daily goals:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refreshGoals();
  }, [refreshGoals]);

  // Keep daily goals state in sync across screens/components.
  // This ensures global UI (like the completion popup) reacts immediately.
  useEffect(() => {
    if (!uid) return;

    const goalsRef = doc(db, 'dailyGoals', uid);
    const unsubscribe = onSnapshot(goalsRef, (snapshot) => {
      if (!snapshot.exists()) return;
      setGoalsData(snapshot.data() as DailyGoalsData);
    });

    return () => unsubscribe();
  }, [uid]);

  // Refresh at local midnight so day rollover logic runs (including auto-claim).
  useEffect(() => {
    if (!uid) return;

    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 5, 0);
    const msUntilMidnight = Math.max(0, nextMidnight.getTime() - now.getTime());

    const timeoutId = window.setTimeout(() => {
      refreshGoals();
    }, msUntilMidnight);

    return () => window.clearTimeout(timeoutId);
  }, [uid, refreshGoals]);

  /**
   * Record progress toward a goal type.
   * Called by integration points (FinalResultsScreen, DuelFinalScreen, etc.)
   */
  const recordProgress = useCallback(async (
    goalType: string,
    value: number = 1,
    params: RecordProgressParams = {}
  ): Promise<RecordProgressResult | undefined> => {
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
  const claimBonusXp = useCallback(async (): Promise<number | undefined> => {
    if (!uid || !goalsData?.allCompleted || goalsData?.bonusXpAwarded) return;
    try {
      await awardBonusXp(uid, goalsData.bonusXpAmount);
      await markBonusXpAwarded(uid);
      await refreshGoals();
      return goalsData.bonusXpAmount;
    } catch (err) {
      console.error('Failed to claim bonus XP:', err);
      setError((err as Error).message);
    }
  }, [uid, goalsData, refreshGoals]);

  // Derived state
  const goals = goalsData?.goals || [];
  const allCompleted = goalsData?.allCompleted || false;
  const bonusXpAwarded = goalsData?.bonusXpAwarded || false;
  const bonusXpAmount = goalsData?.bonusXpAmount || 0;
  const currentDate = getTodayDateString();
  const isTodayGoals = goalsData?.date === currentDate;

  return useMemo(() => ({
    goals: isTodayGoals ? goals : [],
    allCompleted: isTodayGoals ? allCompleted : false,
    bonusXpAwarded: isTodayGoals ? bonusXpAwarded : false,
    bonusXpAmount,
    loading,
    error,
    refreshGoals,
    recordProgress,
    claimBonusXp,
    GOAL_TYPES
  }), [goals, isTodayGoals, allCompleted, bonusXpAwarded, bonusXpAmount, loading, error, refreshGoals, recordProgress, claimBonusXp]);
}
