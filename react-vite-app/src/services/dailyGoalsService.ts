import { doc, getDoc, setDoc, updateDoc, serverTimestamp, type FieldValue, type Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  selectRandomGoals,
  DAILY_GOALS_BONUS_XP,
  DAILY_GOALS_COUNT
} from '../utils/dailyGoalDefinitions';

// ────── Types ──────

export interface DailyGoalItem {
  id: string;
  description: string;
  type: string;
  target: number;
  current: number;
  completed: boolean;
  isThreshold?: boolean;
  targetDifficulty?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface DailyGoalsDoc {
  uid: string;
  date: string;
  goals: DailyGoalItem[];
  allCompleted: boolean;
  bonusXpAwarded: boolean;
  bonusXpAmount: number;
  createdAt: FirestoreTimestamp | FieldValue | null;
  completedAt: FirestoreTimestamp | FieldValue | null;
}

export interface GoalProgressResult {
  updated: boolean;
  allCompleted: boolean;
}

export interface GoalProgressParams {
  targetDifficulty?: string;
  [key: string]: string | undefined;
}

// ────── Functions ──────

/**
 * Get today's date string in YYYY-MM-DD format (user's local timezone).
 */
export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get or create daily goals for a user.
 * If the stored goals are from a previous day (or don't exist), generate new ones.
 */
export async function getOrCreateDailyGoals(uid: string): Promise<DailyGoalsDoc> {
  const today = getTodayDateString();
  const goalsRef = doc(db, 'dailyGoals', uid);
  const snapshot = await getDoc(goalsRef);

  if (snapshot.exists()) {
    const data = snapshot.data() as DailyGoalsDoc;
    if (data.date === today) {
      return data;
    }
  }

  // Goals are stale or don't exist — generate new ones
  const selectedGoals = selectRandomGoals(DAILY_GOALS_COUNT);
  const goalsData: DailyGoalsDoc = {
    uid,
    date: today,
    goals: selectedGoals.map(goal => ({
      id: goal.id,
      description: goal.description,
      type: goal.type,
      target: goal.target,
      current: 0,
      completed: false,
      ...(goal.isThreshold ? { isThreshold: true } : {}),
      ...(goal.extraParams || {})
    })),
    allCompleted: false,
    bonusXpAwarded: false,
    bonusXpAmount: DAILY_GOALS_BONUS_XP,
    createdAt: serverTimestamp(),
    completedAt: null
  };

  await setDoc(goalsRef, goalsData);
  return goalsData;
}

/**
 * Record progress toward a daily goal.
 * If the daily goals doc doesn't exist or is from a previous day,
 * creates today's goals first so progress is never dropped.
 */
export async function recordGoalProgress(
  uid: string,
  goalType: string,
  value: number = 1,
  params: GoalProgressParams = {}
): Promise<GoalProgressResult> {
  const today = getTodayDateString();
  const goalsRef = doc(db, 'dailyGoals', uid);
  let snapshot = await getDoc(goalsRef);
  let data = snapshot.exists() ? (snapshot.data() as DailyGoalsDoc) : null;

  // Ensure today's goals exist (e.g. user may not have opened Daily Goals panel yet)
  if (!snapshot.exists() || (data && data.date !== today)) {
    await getOrCreateDailyGoals(uid);
    snapshot = await getDoc(goalsRef);
    if (!snapshot.exists()) {
      return { updated: false, allCompleted: false };
    }
    data = snapshot.data() as DailyGoalsDoc;
  }

  // Already all completed + bonus awarded — no further updates needed
  if (data.allCompleted && data.bonusXpAwarded) {
    return { updated: false, allCompleted: true };
  }

  let anyUpdated = false;
  const updatedGoals = data.goals.map(goal => {
    if (goal.type !== goalType) return goal;
    if (goal.completed) return goal;

    // Check extra params (e.g., targetDifficulty must match)
    if (goal.targetDifficulty && params.targetDifficulty !== goal.targetDifficulty) {
      return goal;
    }

    const updated = { ...goal };

    if (goal.isThreshold) {
      // Threshold: track the best single value
      updated.current = Math.max(goal.current, value);
    } else {
      // Counter: accumulate
      updated.current = goal.current + value;
    }

    if (updated.current >= goal.target) {
      updated.completed = true;
    }

    anyUpdated = true;
    return updated;
  });

  if (!anyUpdated) {
    return { updated: false, allCompleted: data.allCompleted };
  }

  const allCompleted = updatedGoals.every(g => g.completed);

  const updatePayload: Record<string, unknown> = {
    goals: updatedGoals,
    allCompleted,
  };

  if (allCompleted && !data.allCompleted) {
    updatePayload.completedAt = serverTimestamp();
  }

  await updateDoc(goalsRef, updatePayload);

  return {
    updated: true,
    allCompleted,
  };
}

/**
 * Mark the daily bonus XP as awarded (prevents double-award).
 */
export async function markBonusXpAwarded(uid: string): Promise<void> {
  const goalsRef = doc(db, 'dailyGoals', uid);
  await updateDoc(goalsRef, { bonusXpAwarded: true });
}
