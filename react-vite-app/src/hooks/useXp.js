import { useState, useEffect, useMemo } from 'react';
import { getUserXp, awardXp as awardXpService } from '../services/xpService';
import { getLevelProgress } from '../utils/xp';

/**
 * Hook for XP and level (placeholder: no auth yet, xp from service returns 0).
 * @returns {{ xp: number, level: number, levelProgress: object, awardXp: function, isLoading: boolean }}
 */
export function useXp() {
  const [xp, setXp] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Placeholder uid; later from auth context
  const uid = null;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setIsLoading(true);
    getUserXp(uid)
      .then((value) => {
        if (!cancelled) setXp(value);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [uid]);

  const levelProgress = useMemo(() => getLevelProgress(xp), [xp]);
  const level = levelProgress.level;

  const awardXp = useMemo(() => (source, amount) => {
    awardXpService(uid, source, amount);
    // Placeholder: no persistence, so local state could be updated for demo (optional)
    // setXp(prev => prev + amount);
  }, [uid]);

  return {
    xp,
    level,
    levelProgress,
    awardXp,
    isLoading
  };
}
