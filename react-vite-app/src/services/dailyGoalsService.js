import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  selectRandomGoals,
  DAILY_GOALS_BONUS_XP,
  DAILY_GOALS_COUNT
} from '../utils/dailyGoalDefinitions';

/**
 * Get today's date string in YYYY-MM-DD format (user's local timezone).
 */
export function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get or create daily goals for a user.
 * If the stored goals are from a previous day (or don't exist), generate new ones.
 *
 * @param {string} uid
 * @returns {Promise<object>} The daily goals document data
 */
export async function getOrCreateDailyGoals(uid) {
  const today = getTodayDateString();
  const goalsRef = doc(db, 'dailyGoals', uid);
  const snapshot = await getDoc(goalsRef);

  if (snapshot.exists()) {
    const data = snapshot.data();
    if (data.date === today) {
      return data;
    }
  }

  // Goals are stale or don't exist — generate new ones
  const selectedGoals = selectRandomGoals(DAILY_GOALS_COUNT);
  const goalsData = {
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
 *
 * @param {string} uid
 * @param {string} goalType — matches the `type` field on goal objects (from GOAL_TYPES)
 * @param {number} value — the value to record (1 for increment, or a score for threshold)
 * @param {object} [params] — optional params for filtering (e.g., { targetDifficulty: 'hard' })
 * @returns {Promise<{ updated: boolean, allCompleted: boolean }>}
 */
export async function recordGoalProgress(uid, goalType, value = 1, params = {}) {
  const today = getTodayDateString();
  const goalsRef = doc(db, 'dailyGoals', uid);
  const snapshot = await getDoc(goalsRef);

  if (!snapshot.exists()) {
    return { updated: false, allCompleted: false };
  }

  const data = snapshot.data();

  // Don't update stale goals
  if (data.date !== today) {
    return { updated: false, allCompleted: false };
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

  const updatePayload = {
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
 *
 * @param {string} uid
 * @returns {Promise<void>}
 */
export async function markBonusXpAwarded(uid) {
  const goalsRef = doc(db, 'dailyGoals', uid);
  await updateDoc(goalsRef, { bonusXpAwarded: true });
}
