import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createLobby,
  findLobbyByGameId,
  joinLobby,
  leaveLobby,
  subscribeLobby,
  subscribePublicLobbies,
  subscribeUserLobbyHistory,
  sendHeartbeat,
  removeStalePlayersFromLobby,
  setPlayerReady,
  updateLobbyRoundTime,
  updateLobbyDifficulty,
  deleteLobby,
  markUserLobbyDeleted,
  type LobbyDoc,
  type UserLobbyHistoryDoc
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

export type UserLobbyHistory = UserLobbyHistoryDoc & {
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
  hostGame: (visibility: 'public' | 'private', roundTimeSeconds?: number) => Promise<HostGameResult | null>;
  joinByCode: (gameId: string) => Promise<JoinByCodeResult | null>;
  joinPublicGame: (docId: string) => Promise<boolean>;
  clearError: () => void;
}

export interface UseWaitingRoomReturn {
  lobby: LobbyData | null;
  isLoading: boolean;
  error: string | null;
  leave: () => Promise<void>;
  toggleReady: (ready: boolean) => Promise<void>;
  updateRoundTime: (roundTimeSeconds: number) => Promise<void>;
  updateDifficulty: (difficulty: string) => Promise<void>;
}

export interface UseMyGamesReturn {
  myLobbies: UserLobbyHistory[];
  isLoading: boolean;
  error: string | null;
  closingGameIds: Set<string>;
  closeGame: (docId: string) => Promise<void>;
}

/**
 * Hook for the MultiplayerLobby screen.
 * Manages: public lobby list, hosting flow, join-by-code flow.
 */
const GUEST_HOST_ERROR = 'Guests can only join games. Sign in to host.';

export function useLobby(
  userUid: string,
  userUsername: string,
  selectedDifficulty: string,
  isGuest: boolean
): UseLobbyReturn {
  const [publicLobbies, setPublicLobbies] = useState<PublicLobby[]>([]);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to active public waiting lobbies in real-time.
  useEffect(() => {
    const unsubscribe = subscribePublicLobbies((lobbies) => {
      setPublicLobbies(lobbies as PublicLobby[]);
    });
    return unsubscribe;
  }, []);

  /**
   * Host a new game.
   * Hosting is only allowed for non-guest (logged-in) accounts.
   */
  const hostGame = useCallback(async (visibility: 'public' | 'private', roundTimeSeconds?: number): Promise<HostGameResult | null> => {
    if (isGuest) {
      setError(GUEST_HOST_ERROR);
      return null;
    }
    setIsCreating(true);
    setError(null);
    try {
      const result = await createLobby(userUid, userUsername, selectedDifficulty, visibility, roundTimeSeconds);
      return result;
    } catch (err) {
      console.error('Failed to create lobby:', err);
      setError('Failed to create game. Please try again.');
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [userUid, userUsername, selectedDifficulty, isGuest]);

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
  const hadLobbySnapshot = useRef<boolean>(false);
  const wasHostInLastSnapshot = useRef<boolean>(false);
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
    hadLobbySnapshot.current = false;
    wasHostInLastSnapshot.current = false;

    const unsubscribe = subscribeLobby(lobbyDocId, (lobbyData, reason) => {
      setLobby(lobbyData as LobbyData | null);
      setIsLoading(false);

      if (!lobbyData) {
        // Differentiate user-initiated leave vs inactivity vs host/lobby closure.
        if (hasLeft.current) {
          setError('This lobby no longer exists.');
        } else if (reason === 'inactive') {
          setError('Lobby closed due to inactivity.');
        } else if (hadLobbySnapshot.current && !wasHostInLastSnapshot.current) {
          setError('Host left the lobby. The game was closed.');
        } else {
          setError('This lobby no longer exists.');
        }
      } else {
        hadLobbySnapshot.current = true;
        wasHostInLastSnapshot.current = lobbyData.hostUid === userUid;
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
        leaveLobby(docIdRef.current, uidRef.current).catch(() => { });
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
    sendHeartbeat(lobbyDocId, userUid).catch(() => { });

    const heartbeatInterval = setInterval(() => {
      if (!hasLeft.current) {
        sendHeartbeat(docIdRef.current, uidRef.current).catch(() => { });
      }
    }, 10_000); // every 10 seconds

    return () => clearInterval(heartbeatInterval);
  }, [lobbyDocId, userUid]);

  // Stale player detection: periodically remove disconnected players
  useEffect(() => {
    if (!lobbyDocId || !userUid) return;

    const staleCheckInterval = setInterval(() => {
      if (!hasLeft.current) {
        removeStalePlayersFromLobby(docIdRef.current, uidRef.current).catch(() => { });
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

  /**
   * Toggle the player's ready status.
   */
  const toggleReady = useCallback(async (ready: boolean): Promise<void> => {
    if (!lobbyDocId || !userUid) return;
    try {
      await setPlayerReady(lobbyDocId, userUid, ready);
    } catch (err) {
      console.error('Failed to update ready status:', err);
    }
  }, [lobbyDocId, userUid]);

  /**
   * Update the round time setting on the lobby.
   * Should only be called by the host.
   */
  const updateRoundTime = useCallback(async (roundTimeSeconds: number): Promise<void> => {
    if (!lobbyDocId) return;
    try {
      await updateLobbyRoundTime(lobbyDocId, roundTimeSeconds);
    } catch (err) {
      console.error('Failed to update round time:', err);
    }
  }, [lobbyDocId]);

  /**
   * Update the difficulty setting on the lobby.
   * Should only be called by the host.
   */
  const updateDifficulty = useCallback(async (difficulty: string): Promise<void> => {
    if (!lobbyDocId) return;
    try {
      await updateLobbyDifficulty(lobbyDocId, difficulty);
    } catch (err) {
      console.error('Failed to update difficulty:', err);
    }
  }, [lobbyDocId]);

  return {
    lobby,
    isLoading,
    error,
    leave,
    toggleReady,
    updateRoundTime,
    updateDifficulty
  };
}

/**
 * Hook for the My Games screen.
 * Subscribes to lobbies hosted by the current user.
 */
export function useMyGames(userUid: string): UseMyGamesReturn {
  const [myLobbies, setMyLobbies] = useState<UserLobbyHistory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [closingGameIds, setClosingGameIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userUid) {
      setMyLobbies([]);
      setIsLoading(false);
      return;
    }

    const unsubscribe = subscribeUserLobbyHistory(userUid, (lobbies) => {
      setMyLobbies(lobbies as UserLobbyHistory[]);
      setIsLoading(false);
      setError(null);
    });

    return unsubscribe;
  }, [userUid]);

  const closeGame = useCallback(async (docId: string): Promise<void> => {
    if (!docId) return;
    setClosingGameIds((prev) => {
      const next = new Set(prev);
      next.add(docId);
      return next;
    });
    try {
      let historyUpdated = false;
      try {
        await markUserLobbyDeleted(docId);
        historyUpdated = true;
      } catch (err) {
        console.error('Failed to update lobby history:', err);
      }
      try {
        await deleteLobby(docId);
      } catch (err) {
        console.error('Failed to delete lobby:', err);
        if (!historyUpdated) {
          throw err;
        }
      }
    } catch (err) {
      console.error('Failed to close lobby:', err);
      setError('Failed to remove game. Please try again.');
    } finally {
      setClosingGameIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }, []);

  return {
    myLobbies,
    isLoading,
    error,
    closingGameIds,
    closeGame
  };
}
