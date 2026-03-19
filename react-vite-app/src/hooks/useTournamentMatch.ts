import { useState, useEffect } from 'react';
import {
  subscribeUserTournamentMatch,
  type UserTournamentMatch
} from '../services/tournamentService';

export interface UseTournamentMatchReturn {
  tournamentMatch: UserTournamentMatch | null;
  isLoading: boolean;
}

/**
 * Hook to subscribe to a user's active tournament match.
 * Returns match details when the user has a ready or in_progress match.
 */
export function useTournamentMatch(uid: string | null): UseTournamentMatchReturn {
  const [tournamentMatch, setTournamentMatch] = useState<UserTournamentMatch | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!uid) {
      setTournamentMatch(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const unsubscribe = subscribeUserTournamentMatch(uid, (match) => {
      setTournamentMatch(match);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  return { tournamentMatch, isLoading };
}
