import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { getRegions, getFloorsForPoint, getPlayingArea, isPointInPlayingArea } from '../services/regionService';
import {
  subscribeDuel,
  submitDuelGuess,
  processRound,
  advanceToNextRound,
  DUEL_ROUND_TIME_SECONDS,
  STARTING_HEALTH
} from '../services/duelService';
import { sendHeartbeat, removeStalePlayersFromLobby } from '../services/lobbyService';

/**
 * Custom hook for managing a duel (1v1 multiplayer) game.
 * Subscribes to the Firestore duel document and manages local guessing state.
 *
 * @param {string} lobbyDocId - The Firestore document ID of the lobby/duel
 * @param {string} userUid - Current player's UID
 * @param {string} userUsername - Current player's username
 */
export function useDuelGame(lobbyDocId, userUid, _userUsername) {
  // --- Duel document state (from Firestore) ---
  const [duelState, setDuelState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Local guessing state ---
  const [localGuessLocation, setLocalGuessLocation] = useState(null);
  const [localGuessFloor, setLocalGuessFloor] = useState(null);
  const [localAvailableFloors, setLocalAvailableFloors] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [clickRejected, setClickRejected] = useState(false);

  // --- Timer state ---
  const [timeRemaining, setTimeRemaining] = useState(DUEL_ROUND_TIME_SECONDS);
  const timedOutRef = useRef(false);
  const roundKeyRef = useRef(0); // Track round changes to reset timer

  // --- Map/region data ---
  const [regions, setRegions] = useState([]);
  const [playingArea, setPlayingArea] = useState(null);

  // --- Refs for stable callbacks ---
  const duelStateRef = useRef(duelState);
  const hasSubmittedRef = useRef(hasSubmitted);
  const hasLeft = useRef(false);
  const processedRoundRef = useRef(0); // Track which round we already processed

  // Keep refs in sync via useEffect (React lint requires this)
  useEffect(() => {
    duelStateRef.current = duelState;
  }, [duelState]);

  useEffect(() => {
    hasSubmittedRef.current = hasSubmitted;
  }, [hasSubmitted]);

  // Load regions and playing area on mount
  useEffect(() => {
    async function loadData() {
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

    const unsubscribe = subscribeDuel(lobbyDocId, (data) => {
      setDuelState(data);
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
  const opponentHealth = health[opponentUid] ?? STARTING_HEALTH;

  // Guess states
  const myGuess = guesses[userUid] || null;
  const opponentGuess = guesses[opponentUid] || null;
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
    const roundStartMs = duelState.roundStartedAt.toMillis
      ? duelState.roundStartedAt.toMillis()
      : duelState.roundStartedAt;

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
      }, currentImage).catch(err => console.error('Auto-submit failed:', err));
      setHasSubmitted(true); // eslint-disable-line react-hooks/set-state-in-effect -- Intentional: timer expiry auto-submit
    } else {
      // No guess — submit empty
      submitDuelGuess(lobbyDocId, userUid, {
        location: null,
        floor: null,
        timedOut: true,
        noGuess: true
      }, currentImage).catch(err => console.error('No-guess submit failed:', err));
      setHasSubmitted(true);
    }
  }, [phase, timeRemaining, localGuessLocation, localGuessFloor, localAvailableFloors, currentImage, lobbyDocId, userUid]);

  // --- Host processes round when both have guessed ---
  useEffect(() => {
    if (!isHost) return;
    if (phase !== 'guessing') return;
    if (!bothGuessed) return;
    if (processedRoundRef.current === currentRound) return;

    processedRoundRef.current = currentRound;
    processRound(lobbyDocId).catch(err => console.error('Process round failed:', err));
  }, [isHost, phase, bothGuessed, currentRound, lobbyDocId]);

  // --- Actions ---

  /**
   * Place a guess marker on the map
   */
  const placeMarker = useCallback((coords) => {
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
  const selectFloor = useCallback((floor) => {
    if (hasSubmitted) return;
    setLocalGuessFloor(floor);
  }, [hasSubmitted]);

  /**
   * Submit the player's guess
   */
  const submitGuess = useCallback(async () => {
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
      }, currentImage);
    } catch (err) {
      console.error('Submit guess failed:', err);
      setHasSubmitted(false); // Allow retry
    }
  }, [hasSubmitted, localGuessLocation, localGuessFloor, localAvailableFloors, currentImage, lobbyDocId, userUid]);

  /**
   * Advance to next round (host only, after viewing results)
   */
  const nextRound = useCallback(async () => {
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
  const getUsernameForUid = useCallback((uid) => {
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
