import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { getRegions, getFloorsForPoint, getPlayingArea, isPointInPlayingArea } from '../services/regionService';
import {
  subscribeDuel,
  submitDuelGuess,
  processRound,
  advanceToNextRound,
  DUEL_ROUND_TIME_SECONDS,
  STARTING_HEALTH,
  type DuelData
} from '../services/duelService';
import { sendHeartbeat, removeStalePlayersFromLobby } from '../services/lobbyService';

export interface MapCoords {
  x: number;
  y: number;
}

export interface DuelGuess {
  location: MapCoords | null;
  floor: number | null;
  score: number;
  locationScore: number;
  distance: number | null;
  floorCorrect: boolean | null;
  timedOut: boolean;
  noGuess: boolean;
  submittedAt?: unknown;
}

export interface DuelPlayer {
  uid: string;
  username: string;
  joinedAt?: string;
}

export interface DuelImage {
  url: string;
  correctLocation: MapCoords;
  correctFloor: number | null;
  difficulty: string;
}

export interface DuelRoundHistoryEntry {
  roundNumber: number;
  imageUrl: string;
  actualLocation: MapCoords;
  actualFloor: number | null;
  players: Record<string, {
    location: MapCoords | null;
    floor: number | null;
    score: number;
    locationScore: number;
    distance: number | null;
    floorCorrect: boolean | null;
    timedOut: boolean;
    noGuess: boolean;
  }>;
  damage: number;
  multiplier: number;
  damagedPlayer: string | null;
  healthAfter: Record<string, number>;
}

export interface DuelState {
  docId: string;
  phase: 'guessing' | 'results' | 'finished' | null;
  currentRound: number;
  currentImage: DuelImage | null;
  guesses: Record<string, DuelGuess>;
  health: Record<string, number>;
  roundHistory: DuelRoundHistoryEntry[];
  players: DuelPlayer[];
  hostUid: string;
  winner: string | null;
  loser: string | null;
  difficulty: string;
  roundStartedAt: { toMillis?: () => number } | number | null;
  [key: string]: unknown;
}

export interface Region {
  id: string;
  polygon: MapCoords[];
  floors: number[];
  [key: string]: unknown;
}

export interface PlayingArea {
  polygon: MapCoords[];
  [key: string]: unknown;
}

export interface UseDuelGameReturn {
  // State
  duelState: DuelState | null;
  phase: string | null;
  currentRound: number;
  currentImage: DuelImage | null;
  isLoading: boolean;
  error: string | null;

  // Local guess
  localGuessLocation: MapCoords | null;
  localGuessFloor: number | null;
  localAvailableFloors: number[] | null;
  hasSubmitted: boolean;
  clickRejected: boolean;

  // Opponent
  opponentUid: string | null;
  opponentUsername: string;
  opponentHasSubmitted: boolean;

  // Timer
  timeRemaining: number;
  roundTimeSeconds: number;

  // Health
  myHealth: number;
  opponentHealth: number;

  // Scores
  myScore: number | null;
  opponentScore: number | null;
  myGuess: DuelGuess | null;
  opponentGuess: DuelGuess | null;

  // Game info
  roundHistory: DuelRoundHistoryEntry[];
  winner: string | null;
  loser: string | null;
  isHost: boolean;
  hostUid: string | undefined;
  players: DuelPlayer[];
  difficulty: string;

  // Map
  playingArea: PlayingArea | null;
  regions: Region[];

  // Actions
  placeMarker: (coords: MapCoords) => boolean;
  selectFloor: (floor: number) => void;
  submitGuess: () => Promise<void>;
  nextRound: () => Promise<void>;
  getUsernameForUid: (uid: string) => string;
}

/**
 * Custom hook for managing a duel (1v1 multiplayer) game.
 * Subscribes to the Firestore duel document and manages local guessing state.
 */
export function useDuelGame(
  lobbyDocId: string,
  userUid: string,
  _userUsername: string
): UseDuelGameReturn {
  // --- Duel document state (from Firestore) ---
  const [duelState, setDuelState] = useState<DuelState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // --- Local guessing state ---
  const [localGuessLocation, setLocalGuessLocation] = useState<MapCoords | null>(null);
  const [localGuessFloor, setLocalGuessFloor] = useState<number | null>(null);
  const [localAvailableFloors, setLocalAvailableFloors] = useState<number[] | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [clickRejected, setClickRejected] = useState<boolean>(false);

  // --- Timer state ---
  const [timeRemaining, setTimeRemaining] = useState<number>(DUEL_ROUND_TIME_SECONDS);
  const timedOutRef = useRef<boolean>(false);
  const roundKeyRef = useRef<number>(0); // Track round changes to reset timer

  // --- Map/region data ---
  const [regions, setRegions] = useState<Region[]>([]);
  const [playingArea, setPlayingArea] = useState<PlayingArea | null>(null);

  // --- Refs for stable callbacks ---
  const duelStateRef = useRef<DuelState | null>(duelState);
  const hasSubmittedRef = useRef<boolean>(hasSubmitted);
  const hasLeft = useRef<boolean>(false);
  const processedRoundRef = useRef<number>(0); // Track which round we already processed

  // Keep refs in sync via useEffect (React lint requires this)
  useEffect(() => {
    duelStateRef.current = duelState;
  }, [duelState]);

  useEffect(() => {
    hasSubmittedRef.current = hasSubmitted;
  }, [hasSubmitted]);

  // Load regions and playing area on mount
  useEffect(() => {
    async function loadData(): Promise<void> {
      try {
        const [fetchedRegions, fetchedPlayingArea] = await Promise.all([
          getRegions(),
          getPlayingArea()
        ]);
        setRegions(fetchedRegions);
        setPlayingArea(fetchedPlayingArea);
      } catch (err) {
        console.error('Failed to load regions/playing area:', err);
        setRegions([]);
        setPlayingArea(null);
      }
    }
    loadData();
  }, []);

  // Subscribe to duel document
  useEffect(() => {
    if (!lobbyDocId) return;

    const unsubscribe = subscribeDuel(lobbyDocId, (data: DuelData | null) => {
      setDuelState(data as DuelState | null);
      setIsLoading(false);

      if (!data) {
        setError('Game no longer exists.');
      } else {
        setError(null);
      }
    });

    return () => unsubscribe();
  }, [lobbyDocId]);

  // Heartbeat for duel (keep presence alive)
  useEffect(() => {
    if (!lobbyDocId || !userUid) return;

    sendHeartbeat(lobbyDocId, userUid).catch(() => {});

    const heartbeatInterval = setInterval(() => {
      if (!hasLeft.current) {
        sendHeartbeat(lobbyDocId, userUid).catch(() => {});
      }
    }, 10_000);

    return () => clearInterval(heartbeatInterval);
  }, [lobbyDocId, userUid]);

  // Stale player detection
  useEffect(() => {
    if (!lobbyDocId || !userUid) return;

    const staleCheckInterval = setInterval(() => {
      if (!hasLeft.current) {
        removeStalePlayersFromLobby(lobbyDocId, userUid).catch(() => {});
      }
    }, 15_000);

    return () => clearInterval(staleCheckInterval);
  }, [lobbyDocId, userUid]);

  // --- Derived state ---
  const phase = duelState?.phase || null;
  const currentRound = duelState?.currentRound || 0;
  const currentImage = duelState?.currentImage || null;
  const guesses = duelState?.guesses || {};
  const health = duelState?.health || {};
  const roundHistory = duelState?.roundHistory || [];
  const players = useMemo(() => duelState?.players || [], [duelState?.players]);
  const hostUid = duelState?.hostUid;
  const isHost = hostUid === userUid;
  const winner = duelState?.winner || null;
  const loser = duelState?.loser || null;
  const difficulty = duelState?.difficulty || 'all';

  // Find opponent
  const opponent = players.find(p => p.uid !== userUid);
  const opponentUid = opponent?.uid || null;
  const opponentUsername = opponent?.username || 'Opponent';

  // Health values
  const myHealth = health[userUid] ?? STARTING_HEALTH;
  const opponentHealth = health[opponentUid as string] ?? STARTING_HEALTH;

  // Guess states
  const myGuess = guesses[userUid] || null;
  const opponentGuess = guesses[opponentUid as string] || null;
  const opponentHasSubmitted = !!opponentGuess;
  const bothGuessed = !!myGuess && !!opponentGuess;

  // Current round scores (from guesses)
  const myScore = myGuess?.score ?? null;
  const opponentScore = opponentGuess?.score ?? null;

  // Reset local state when round changes (new round starts)
  useEffect(() => {
    if (phase === 'guessing' && currentRound > 0) {
      const roundKey = currentRound;
      if (roundKeyRef.current !== roundKey) {
        roundKeyRef.current = roundKey;
        setLocalGuessLocation(null); // eslint-disable-line react-hooks/set-state-in-effect -- Intentional: syncing local state from Firestore round changes
        setLocalGuessFloor(null);
        setLocalAvailableFloors(null);
        setHasSubmitted(false);
        timedOutRef.current = false;
        setTimeRemaining(DUEL_ROUND_TIME_SECONDS);
        processedRoundRef.current = 0;
      }
    }
  }, [phase, currentRound]);

  // --- Timer effect ---
  useEffect(() => {
    if (phase !== 'guessing' || !duelState?.roundStartedAt) {
      return;
    }

    // Compute start time from Firestore timestamp
    const roundStartedAt = duelState.roundStartedAt as { toMillis?: () => number } | number;
    const roundStartMs = typeof roundStartedAt === 'object' && roundStartedAt?.toMillis
      ? roundStartedAt.toMillis()
      : roundStartedAt as number;

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - roundStartMs) / 1000;
      const remaining = Math.max(0, DUEL_ROUND_TIME_SECONDS - elapsedSeconds);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [phase, duelState?.roundStartedAt]);

  // --- Auto-submit / timeout handling ---
  useEffect(() => {
    if (phase !== 'guessing') return;
    if (timeRemaining > 0) return;
    if (hasSubmittedRef.current) return;
    if (!currentImage) return;
    if (!lobbyDocId || !userUid) return;

    // Timer expired and we haven't submitted yet
    const isInRegion = localAvailableFloors !== null && localAvailableFloors.length > 0;
    const hasValidGuess = localGuessLocation && (!isInRegion || localGuessFloor);

    if (hasValidGuess) {
      // Auto-submit the current guess
      timedOutRef.current = true;
      submitDuelGuess(lobbyDocId, userUid, {
        location: localGuessLocation,
        floor: localGuessFloor,
        timedOut: true,
        noGuess: false
      }, currentImage, duelState?.roundStartedAt ?? undefined, difficulty).catch((err: unknown) => console.error('Auto-submit failed:', err));
      setHasSubmitted(true); // eslint-disable-line react-hooks/set-state-in-effect -- Intentional: timer expiry auto-submit
    } else {
      // No guess — submit empty
      submitDuelGuess(lobbyDocId, userUid, {
        location: null,
        floor: null,
        timedOut: true,
        noGuess: true
      }, currentImage, duelState?.roundStartedAt ?? undefined, difficulty).catch((err: unknown) => console.error('No-guess submit failed:', err));
      setHasSubmitted(true);
    }
  }, [phase, timeRemaining, localGuessLocation, localGuessFloor, localAvailableFloors, currentImage, lobbyDocId, userUid, duelState?.roundStartedAt, difficulty]);

  // --- Host processes round when both have guessed ---
  useEffect(() => {
    if (!isHost) return;
    if (phase !== 'guessing') return;
    if (!bothGuessed) return;
    if (processedRoundRef.current === currentRound) return;

    processedRoundRef.current = currentRound;
    processRound(lobbyDocId).catch((err: unknown) => console.error('Process round failed:', err));
  }, [isHost, phase, bothGuessed, currentRound, lobbyDocId]);

  // --- Actions ---

  /**
   * Place a guess marker on the map
   */
  const placeMarker = useCallback((coords: MapCoords): boolean => {
    if (hasSubmitted) return false;

    if (!isPointInPlayingArea(coords, playingArea)) {
      setClickRejected(true);
      setTimeout(() => setClickRejected(false), 500);
      return false;
    }

    setLocalGuessLocation(coords);
    setClickRejected(false);

    const floors = getFloorsForPoint(coords, regions);
    setLocalAvailableFloors(floors);

    if (floors === null || (localGuessFloor && !floors.includes(localGuessFloor))) {
      setLocalGuessFloor(null);
    }

    return true;
  }, [hasSubmitted, playingArea, regions, localGuessFloor]);

  /**
   * Select a floor
   */
  const selectFloor = useCallback((floor: number): void => {
    if (hasSubmitted) return;
    setLocalGuessFloor(floor);
  }, [hasSubmitted]);

  /**
   * Submit the player's guess
   */
  const submitGuess = useCallback(async (): Promise<void> => {
    if (hasSubmitted) return;
    if (!localGuessLocation || !currentImage) return;

    const isInRegion = localAvailableFloors !== null && localAvailableFloors.length > 0;
    if (isInRegion && !localGuessFloor) return;

    setHasSubmitted(true);

    try {
      await submitDuelGuess(lobbyDocId, userUid, {
        location: localGuessLocation,
        floor: localGuessFloor,
        timedOut: false,
        noGuess: false
      }, currentImage, duelState?.roundStartedAt ?? undefined, difficulty);
    } catch (err) {
      console.error('Submit guess failed:', err);
      setHasSubmitted(false); // Allow retry
    }
  }, [hasSubmitted, localGuessLocation, localGuessFloor, localAvailableFloors, currentImage, lobbyDocId, userUid, duelState?.roundStartedAt, difficulty]);

  /**
   * Advance to next round (host only, after viewing results)
   */
  const nextRound = useCallback(async (): Promise<void> => {
    if (!isHost) return;
    try {
      await advanceToNextRound(lobbyDocId, difficulty);
    } catch (err) {
      console.error('Advance round failed:', err);
    }
  }, [isHost, lobbyDocId, difficulty]);

  /**
   * Get the username for a UID
   */
  const getUsernameForUid = useCallback((uid: string): string => {
    const player = players.find(p => p.uid === uid);
    return player?.username || 'Unknown';
  }, [players]);

  return {
    // State
    duelState,
    phase,
    currentRound,
    currentImage,
    isLoading,
    error,

    // Local guess
    localGuessLocation,
    localGuessFloor,
    localAvailableFloors,
    hasSubmitted,
    clickRejected,

    // Opponent
    opponentUid,
    opponentUsername,
    opponentHasSubmitted,

    // Timer
    timeRemaining,
    roundTimeSeconds: DUEL_ROUND_TIME_SECONDS,

    // Health
    myHealth,
    opponentHealth,

    // Scores
    myScore,
    opponentScore,
    myGuess,
    opponentGuess,

    // Game info
    roundHistory,
    winner,
    loser,
    isHost,
    hostUid,
    players,
    difficulty,

    // Map
    playingArea,
    regions,

    // Actions
    placeMarker,
    selectFloor,
    submitGuess,
    nextRound,
    getUsernameForUid
  };
}
