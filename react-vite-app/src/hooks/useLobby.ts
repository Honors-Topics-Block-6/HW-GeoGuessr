import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createLobby,
  findLobbyByGameId,
  joinLobby,
  leaveLobby,
  subscribeLobby,
  subscribePublicLobbies,
  sendHeartbeat,
  removeStalePlayersFromLobby,
  type LobbyDoc
} from '../services/lobbyService';

export interface LobbyPlayer {
  uid: string;
  username: string;
  joinedAt?: string;
}

export type PublicLobby = LobbyDoc & {
  [key: string]: unknown;
};

export type LobbyData = LobbyDoc & {
  [key: string]: unknown;
};

export interface HostGameResult {
  docId: string;
  gameId: string;
}

export interface JoinByCodeResult {
  docId: string;
}

export interface UseLobbyReturn {
  publicLobbies: PublicLobby[];
  isCreating: boolean;
  isJoining: boolean;
  error: string | null;
  hostGame: (visibility: 'public' | 'private') => Promise<HostGameResult | null>;
  joinByCode: (gameId: string) => Promise<JoinByCodeResult | null>;
  joinPublicGame: (docId: string) => Promise<boolean>;
  clearError: () => void;
}

export interface UseWaitingRoomReturn {
  lobby: LobbyData | null;
  isLoading: boolean;
  error: string | null;
  leave: () => Promise<void>;
}

/**
 * Hook for the MultiplayerLobby screen.
 * Manages: public lobby list, hosting flow, join-by-code flow.
 */
export function useLobby(
  userUid: string,
  userUsername: string,
  selectedDifficulty: string,
  timePenaltyEnabled: boolean = false
): UseLobbyReturn {
  const [publicLobbies, setPublicLobbies] = useState<PublicLobby[]>([]);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to public lobbies in real-time
  useEffect(() => {
    const unsubscribe = subscribePublicLobbies((lobbies) => {
      setPublicLobbies(lobbies as PublicLobby[]);
    });
    return unsubscribe;
  }, []);

  /**
   * Host a new game.
   */
  const hostGame = useCallback(async (visibility: 'public' | 'private'): Promise<HostGameResult | null> => {
    setIsCreating(true);
    setError(null);
    try {
      const result = await createLobby(userUid, userUsername, selectedDifficulty, visibility, timePenaltyEnabled);
      return result;
    } catch (err) {
      console.error('Failed to create lobby:', err);
      setError('Failed to create game. Please try again.');
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [userUid, userUsername, selectedDifficulty, timePenaltyEnabled]);

  /**
   * Join a game by its 6-character code.
   */
  const joinByCode = useCallback(async (gameId: string): Promise<JoinByCodeResult | null> => {
    setIsJoining(true);
    setError(null);
    try {
      const lobby = await findLobbyByGameId(gameId);
      if (!lobby) {
        setError('No active game found with that code.');
        return null;
      }

      await joinLobby(lobby.docId, userUid, userUsername, selectedDifficulty);
      return { docId: lobby.docId };
    } catch (err) {
      console.error('Failed to join lobby:', err);
      setError((err as Error).message || 'Failed to join game. Please try again.');
      return null;
    } finally {
      setIsJoining(false);
    }
  }, [userUid, userUsername, selectedDifficulty]);

  /**
   * Join a public game directly from the list.
   */
  const joinPublicGame = useCallback(async (docId: string): Promise<boolean> => {
    setIsJoining(true);
    setError(null);
    try {
      await joinLobby(docId, userUid, userUsername, selectedDifficulty);
      return true;
    } catch (err) {
      console.error('Failed to join lobby:', err);
      setError((err as Error).message || 'Failed to join game. Please try again.');
      return false;
    } finally {
      setIsJoining(false);
    }
  }, [userUid, userUsername, selectedDifficulty]);

  const clearError = useCallback((): void => setError(null), []);

  return {
    publicLobbies,
    isCreating,
    isJoining,
    error,
    hostGame,
    joinByCode,
    joinPublicGame,
    clearError
  };
}

/**
 * Hook for the WaitingRoom screen.
 * Subscribes to a single lobby document for real-time player updates.
 */
export function useWaitingRoom(lobbyDocId: string, userUid: string): UseWaitingRoomReturn {
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const hasLeft = useRef<boolean>(false);
  const docIdRef = useRef<string>(lobbyDocId);
  const uidRef = useRef<string>(userUid);

  // Keep refs in sync so the beforeunload handler sees current values
  useEffect(() => {
    docIdRef.current = lobbyDocId;
    uidRef.current = userUid;
  }, [lobbyDocId, userUid]);

  // Subscribe to lobby updates
  useEffect(() => {
    if (!lobbyDocId) return;

    hasLeft.current = false;

    const unsubscribe = subscribeLobby(lobbyDocId, (lobbyData) => {
      setLobby(lobbyData as LobbyData | null);
      setIsLoading(false);

      if (!lobbyData) {
        setError('This lobby no longer exists.');
      } else {
        setError(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [lobbyDocId, userUid]);

  // Auto-leave lobby when the browser tab/window is closed
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      if (!hasLeft.current && docIdRef.current && uidRef.current) {
        // Use sendBeacon-style fire-and-forget; leaveLobby is async but
        // we can't await in beforeunload. The call will still reach Firestore
        // in most cases. Stale lobbies are acceptable at this stage.
        leaveLobby(docIdRef.current, uidRef.current).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Heartbeat: periodically tell Firestore we're still connected
  useEffect(() => {
    if (!lobbyDocId || !userUid) return;

    // Send an initial heartbeat immediately
    sendHeartbeat(lobbyDocId, userUid).catch(() => {});

    const heartbeatInterval = setInterval(() => {
      if (!hasLeft.current) {
        sendHeartbeat(docIdRef.current, uidRef.current).catch(() => {});
      }
    }, 10_000); // every 10 seconds

    return () => clearInterval(heartbeatInterval);
  }, [lobbyDocId, userUid]);

  // Stale player detection: periodically remove disconnected players
  useEffect(() => {
    if (!lobbyDocId || !userUid) return;

    const staleCheckInterval = setInterval(() => {
      if (!hasLeft.current) {
        removeStalePlayersFromLobby(docIdRef.current, uidRef.current).catch(() => {});
      }
    }, 15_000); // every 15 seconds

    return () => clearInterval(staleCheckInterval);
  }, [lobbyDocId, userUid]);

  /**
   * Leave the lobby manually.
   */
  const leave = useCallback(async (): Promise<void> => {
    if (!lobbyDocId || !userUid) return;
    hasLeft.current = true;
    try {
      await leaveLobby(lobbyDocId, userUid);
    } catch (err) {
      console.error('Failed to leave lobby:', err);
    }
  }, [lobbyDocId, userUid]);

  return {
    lobby,
    isLoading,
    error,
    leave
  };
}
