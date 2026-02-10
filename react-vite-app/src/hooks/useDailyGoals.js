import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  claimFirstLocationWinner,
  fetchDailyGoals,
  getTodayKey,
  getUserDailyProgress,
  subscribeToDailyGoals,
  updateUserDailyProgress
} from '../services/dailyGoalService';
import { getImageById } from '../services/imageService';

const LOCAL_STORAGE_KEY = 'hw-geogessr-player-id';
const DAY_REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_CORRECT_DISTANCE_THRESHOLD = 8;

function generateFallbackPlayerId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `player-${Math.random().toString(36).slice(2, 12)}`;
}

function resolvePlayerId({ providedId, currentId }) {
  if (providedId) {
    return providedId;
  }

  if (currentId) {
    return currentId;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);

      if (stored) {
        return stored;
      }

      const generated = generateFallbackPlayerId();
      window.localStorage.setItem(LOCAL_STORAGE_KEY, generated);
      return generated;
    } catch (error) {
      console.warn('Unable to read/write localStorage for player id', error);
      return generateFallbackPlayerId();
    }
  }

  return generateFallbackPlayerId();
}

function isCorrectGuess(result, threshold = DEFAULT_CORRECT_DISTANCE_THRESHOLD) {
  if (!result || typeof result.distance !== 'number') {
    return false;
  }

  return result.distance <= threshold;
}

export function useDailyGoals({ playerId: providedPlayerId } = {}) {
  const [playerId, setPlayerId] = useState(() => resolvePlayerId({ providedId: providedPlayerId }));
  const [dateKey, setDateKey] = useState(() => getTodayKey());
  const [goals, setGoals] = useState(null);
  const [progress, setProgress] = useState(null);
  const [firstLocationDetails, setFirstLocationDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // Ensure state aligns with provided player id when available (future auth support).
  useEffect(() => {
    if (providedPlayerId) {
      setPlayerId(providedPlayerId);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LOCAL_STORAGE_KEY, providedPlayerId);
        } catch (err) {
          console.warn('Unable to cache provided player id', err);
        }
      }
    }
  }, [providedPlayerId]);

  // Refresh the date key once per minute to handle day rollover.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const nextKey = getTodayKey();
      setDateKey(prevKey => (prevKey === nextKey ? prevKey : nextKey));
    }, DAY_REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  // Fetch initial daily goals + progress. Re-run when playerId/date change or refresh triggered.
  useEffect(() => {
    if (!playerId || !dateKey) {
      return;
    }

    let isActive = true;
    let unsubscribe = null;

    async function bootstrap() {
      setLoading(true);
      try {
        const [goalData, progressData] = await Promise.all([
          fetchDailyGoals(dateKey),
          getUserDailyProgress(playerId, dateKey)
        ]);

        if (!isActive) {
          return;
        }

        setGoals(goalData);
        setProgress(progressData);
        setError(null);

        unsubscribe = subscribeToDailyGoals(dateKey, snapshot => {
          if (snapshot) {
            setGoals(snapshot);
          }
        });
      } catch (err) {
        console.error('Failed to initialise daily goals', err);
        if (isActive) {
          setError('Unable to load daily goals right now.');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      isActive = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [playerId, dateKey, refreshToken]);

  // Load metadata for the "first location" when it changes.
  useEffect(() => {
    let isMounted = true;

    async function loadDetails() {
      if (!goals?.firstLocationId) {
        setFirstLocationDetails(null);
        return;
      }

      try {
        const details = await getImageById(goals.firstLocationId);
        if (isMounted) {
          setFirstLocationDetails(details);
        }
      } catch (err) {
        console.warn('Unable to fetch details for first-location goal', err);
      }
    }

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [goals?.firstLocationId]);

  const goalDateLabel = useMemo(() => {
    if (!dateKey) {
      return '';
    }

    const [year, month, day] = dateKey.split('-').map(part => Number(part));
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return dateKey;
    }

    const date = new Date(year, month - 1, day);
    try {
      return date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    } catch (err) {
      return dateKey;
    }
  }, [dateKey]);

  const refreshGoals = useCallback(() => {
    setRefreshToken(token => token + 1);
  }, []);

  const recordGuessOutcome = useCallback(
    async ({ result }) => {
      if (!playerId || !goals || !progress || !result) {
        return;
      }

      if (!isCorrectGuess(result)) {
        return;
      }

      const environment = result.environment || 'unknown';
      const updates = {};

      if (environment === 'indoor' && typeof progress.indoorCount === 'number') {
        const nextCount = Math.min(goals.indoorTarget, (progress.indoorCount || 0) + 1);
        if (nextCount !== progress.indoorCount) {
          updates.indoorCount = nextCount;
        }
        if (!progress.indoorCompleted && nextCount >= goals.indoorTarget) {
          updates.indoorCompleted = true;
        }
      }

      if (environment === 'outdoor' && typeof progress.outdoorCount === 'number') {
        const nextCount = Math.min(goals.outdoorTarget, (progress.outdoorCount || 0) + 1);
        if (nextCount !== progress.outdoorCount) {
          updates.outdoorCount = nextCount;
        }
        if (!progress.outdoorCompleted && nextCount >= goals.outdoorTarget) {
          updates.outdoorCompleted = true;
        }
      }

      let firstLocationUpdated = false;

      if (
        goals.firstLocationId &&
        result.imageId === goals.firstLocationId &&
        !progress.firstLocationCompleted
      ) {
        try {
          const claimResult = await claimFirstLocationWinner(playerId, dateKey);
          if (claimResult.success) {
            updates.firstLocationCompleted = true;
            firstLocationUpdated = true;
            setGoals(prev => (prev ? { ...prev, firstWinner: { playerId } } : prev));
          } else if (claimResult.alreadyClaimed && claimResult.winner) {
            setGoals(prev => (prev ? { ...prev, firstWinner: claimResult.winner } : prev));
          }
        } catch (err) {
          console.error('Failed to claim first-location goal', err);
        }
      }

      if (Object.keys(updates).length === 0 && !firstLocationUpdated) {
        return;
      }

      setProgress(prev => (prev ? { ...prev, ...updates } : prev));

      try {
        await updateUserDailyProgress(playerId, updates, dateKey);
      } catch (err) {
        console.error('Failed to persist daily goal progress', err);
      }
    },
    [playerId, goals, progress, dateKey]
  );

  return {
    loading,
    error,
    playerId,
    dateKey,
    goalDateLabel,
    goals,
    progress,
    firstLocationDetails,
    refreshGoals,
    recordGuessOutcome
  };
}
