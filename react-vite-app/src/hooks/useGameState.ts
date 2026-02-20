import { useState, useCallback, useEffect, useRef } from 'react';
import { getRandomImage, type GameImage as ServiceGameImage } from '../services/imageService';
import { getRegions, getFloorsForPoint, getPlayingArea, isPointInPlayingArea } from '../services/regionService';

const TOTAL_ROUNDS = 5;
const MAX_SCORE_PER_ROUND = 5500; // 5000 for location + 500 floor bonus
export const ROUND_TIME_SECONDS = 20;
const SINGLEPLAYER_SEEN_HISTORY_KEY = 'singleplayerSeenImageHistory.v1';

export interface MapCoords {
  x: number;
  y: number;
}

export type GameImage = ServiceGameImage & {
  [key: string]: unknown;
};

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

export interface RoundResult {
  roundNumber: number;
  imageUrl: string;
  guessLocation: MapCoords | null;
  actualLocation: MapCoords;
  guessFloor: number | null;
  actualFloor: number | null;
  distance: number | null;
  locationScore: number;
  floorCorrect: boolean | null;
  score: number;
  timeTakenSeconds: number;
  timedOut: boolean;
  noGuess?: boolean;
}

export type ScreenState = 'title' | 'game' | 'result' | 'finalResults' | 'multiplayerLobby' | 'waitingRoom' | 'difficultySelect' | 'duelGame';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'all' | null;
export type GameMode = 'singleplayer' | 'multiplayer' | null;

export interface UseGameStateReturn {
  // State
  screen: ScreenState;
  currentRound: number;
  totalRounds: number;
  currentImage: GameImage | null;
  guessLocation: MapCoords | null;
  guessFloor: number | null;
  availableFloors: number[] | null;
  currentResult: RoundResult | null;
  roundResults: RoundResult[];
  isLoading: boolean;
  error: string | null;
  clickRejected: boolean;
  playingArea: PlayingArea | null;
  timeRemaining: number;
  roundTimeSeconds: number;
  difficulty: Difficulty;
  mode: GameMode;
  lobbyDocId: string | null;

  // Actions
  setScreen: React.Dispatch<React.SetStateAction<ScreenState>>;
  startGame: (selectedDifficulty: string, selectedMode?: string) => Promise<void>;
  placeMarker: (coords: MapCoords) => boolean;
  selectFloor: (floor: number) => void;
  submitGuess: () => void;
  nextRound: () => Promise<void>;
  viewFinalResults: () => void;
  resetGame: () => void;
  setMode: React.Dispatch<React.SetStateAction<GameMode>>;
  setLobbyDocId: React.Dispatch<React.SetStateAction<string | null>>;
  setDifficulty: React.Dispatch<React.SetStateAction<Difficulty>>;
}

/**
 * Calculate distance between two points (in percentage coordinates)
 */
export function calculateDistance(guess: MapCoords, actual: MapCoords): number {
  const dx = guess.x - actual.x;
  const dy = guess.y - actual.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate location score based on distance (0-5000 points)
 * Uses a steep exponential decay formula: 5000 * e^(-100 * (d/D)^2)
 * At 10 ft (distance=5 in map coords) or closer, the player gets 5000.
 * Score drops very dramatically with distance, rewarding precise guesses.
 */
export function calculateLocationScore(distance: number): number {
  const maxScore = 5000;
  const perfectRadius = 5; // 10 ft = 5 percentage units (distance * 2 = feet)
  const maxDistance = Math.sqrt(100 * 100 + 100 * 100) - perfectRadius; // ~136.42

  if (distance <= perfectRadius) return maxScore;

  const effectiveDistance = distance - perfectRadius;
  const ratio = effectiveDistance / maxDistance;
  const score = Math.round(maxScore * Math.exp(-100 * ratio * ratio));
  return Math.max(0, Math.min(maxScore, score));
}

/**
 * Custom hook for managing game state
 * Handles screen transitions, image loading, multi-round tracking, and scoring
 */
export function useGameState(): UseGameStateReturn {
  // Current screen: 'title', 'game', 'result', or 'finalResults'
  const [screen, setScreen] = useState<ScreenState>('title');

  // Current round number (1-5)
  const [currentRound, setCurrentRound] = useState<number>(1);

  // Current image being shown
  const [currentImage, setCurrentImage] = useState<GameImage | null>(null);
  // Image IDs/URLs used in this game session to prevent repeats within a run
  const [usedImageIds, setUsedImageIds] = useState<string[]>([]);
  const [usedImageUrls, setUsedImageUrls] = useState<string[]>([]);
  const usedInThisGameIdsRef = useRef<string[]>([]);
  const usedInThisGameUrlsRef = useRef<string[]>([]);
  const seenImageIdsRef = useRef<string[]>([]);
  const seenImageUrlsRef = useRef<string[]>([]);

  // User's guess location on the map (x, y in percentages)
  const [guessLocation, setGuessLocation] = useState<MapCoords | null>(null);

  // User's guess for the floor
  const [guessFloor, setGuessFloor] = useState<number | null>(null);

  // Results for the current round (shown on result screen)
  const [currentResult, setCurrentResult] = useState<RoundResult | null>(null);

  // All round results (for final summary)
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);

  // Loading state
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Regions from Firestore (for floor selection)
  const [regions, setRegions] = useState<Region[]>([]);

  // Playing area from Firestore (for restricting click area)
  const [playingArea, setPlayingArea] = useState<PlayingArea | null>(null);

  // Available floors based on selected location (null if not in a region)
  const [availableFloors, setAvailableFloors] = useState<number[] | null>(null);

  // Round timer state (seconds remaining in this guessing phase)
  const [timeRemaining, setTimeRemaining] = useState<number>(ROUND_TIME_SECONDS);
  const [roundStartTime, setRoundStartTime] = useState<number | null>(null);
  const timedOutRef = useRef<boolean>(false);

  // Track when a click is rejected (outside playing area)
  const [clickRejected, setClickRejected] = useState<boolean>(false);

  // Selected difficulty for the current game
  const [difficulty, setDifficulty] = useState<Difficulty>(null);

  // Game mode: 'singleplayer' or 'multiplayer'
  const [mode, setMode] = useState<GameMode>(null);

  // Current lobby document ID (when in multiplayer)
  const [lobbyDocId, setLobbyDocId] = useState<string | null>(null);

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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SINGLEPLAYER_SEEN_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ids?: string[]; urls?: string[] };
      seenImageIdsRef.current = Array.isArray(parsed.ids) ? parsed.ids : [];
      seenImageUrlsRef.current = Array.isArray(parsed.urls) ? parsed.urls : [];
    } catch (err) {
      console.warn('Failed to parse singleplayer seen-image history:', err);
      seenImageIdsRef.current = [];
      seenImageUrlsRef.current = [];
    }
  }, []);

  const persistSeenHistory = useCallback((): void => {
    try {
      window.localStorage.setItem(
        SINGLEPLAYER_SEEN_HISTORY_KEY,
        JSON.stringify({
          ids: seenImageIdsRef.current,
          urls: seenImageUrlsRef.current
        })
      );
    } catch (err) {
      console.warn('Failed to persist singleplayer seen-image history:', err);
    }
  }, []);

  const trackSeenImage = useCallback((image: GameImage): void => {
    let changed = false;
    if (image.id && !seenImageIdsRef.current.includes(image.id)) {
      seenImageIdsRef.current = [...seenImageIdsRef.current, image.id];
      changed = true;
    }
    if (image.url && !seenImageUrlsRef.current.includes(image.url)) {
      seenImageUrlsRef.current = [...seenImageUrlsRef.current, image.url];
      changed = true;
    }
    if (changed) {
      persistSeenHistory();
    }
  }, [persistSeenHistory]);

  /**
   * Load a new image for the current round
   */
  const loadNewImage = useCallback(async (
    excludeIds: string[] = usedImageIds,
    excludeUrls: string[] = usedImageUrls
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      let image = await getRandomImage(difficulty, {
        excludeImageIds: excludeIds,
        excludeImageUrls: excludeUrls
      });
      // Only allow a repeat when there are no other images (exhausted pool)
      if (!image && (excludeIds.length > 0 || excludeUrls.length > 0)) {
        image = await getRandomImage(difficulty);
      }
      if (!image) {
        setError('No approved images are available yet.');
        setCurrentImage(null);
        return false;
      }
      setCurrentImage(image as GameImage | null);
      if (image?.id) {
        usedInThisGameIdsRef.current = [...usedInThisGameIdsRef.current, image.id].filter((id, i, arr) => arr.indexOf(id) === i);
        setUsedImageIds((prev) => (prev.includes(image.id) ? prev : [...prev, image.id]));
      }
      if (image?.url) {
        usedInThisGameUrlsRef.current = [...usedInThisGameUrlsRef.current, image.url].filter((url, i, arr) => arr.indexOf(url) === i);
        setUsedImageUrls((prev) => (prev.includes(image.url) ? prev : [...prev, image.url]));
      }
      trackSeenImage(image as GameImage);
      setGuessLocation(null);
      setGuessFloor(null);
      setAvailableFloors(null);
      // Timer will be (re)started when the game screen is shown for this image
      return true;
    } catch (err) {
      console.error('Failed to load image:', err);
      setError('Failed to load image. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [difficulty, usedImageIds, usedImageUrls, trackSeenImage]);

  /**
   * Start a new game - reset everything and fetch first image
   */
  const startGame = useCallback(async (selectedDifficulty: string, selectedMode: string = 'singleplayer'): Promise<void> => {
    setCurrentRound(1);
    setRoundResults([]);
    setCurrentResult(null);
    setDifficulty(selectedDifficulty as Difficulty);
    setMode(selectedMode as GameMode);
    setLobbyDocId(null);
    setUsedImageIds([]);
    setUsedImageUrls([]);
    usedInThisGameIdsRef.current = [];
    usedInThisGameUrlsRef.current = [];

    // Multiplayer: go to lobby screen instead of starting a game
    if (selectedMode === 'multiplayer') {
      setScreen('multiplayerLobby');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Reload playing area and regions in case they were updated in the editor
      let image = await getRandomImage(selectedDifficulty, {
        excludeImageIds: seenImageIdsRef.current,
        excludeImageUrls: seenImageUrlsRef.current
      });
      if (!image) {
        image = await getRandomImage(selectedDifficulty);
      }
      const [fetchedPlayingArea, fetchedRegions] = await Promise.all([
        getPlayingArea(),
        getRegions()
      ]);
      if (!image) {
        setError('No approved images are available yet.');
        return;
      }

      setPlayingArea(fetchedPlayingArea);
      setRegions(fetchedRegions);
      setCurrentImage(image as GameImage | null);
      if (image?.id) {
        usedInThisGameIdsRef.current = [image.id];
        setUsedImageIds([image.id]);
      }
      if (image?.url) {
        usedInThisGameUrlsRef.current = [image.url];
        setUsedImageUrls([image.url]);
      }
      trackSeenImage(image as GameImage);
      setGuessLocation(null);
      setGuessFloor(null);
      setAvailableFloors(null);
      setTimeRemaining(ROUND_TIME_SECONDS);
      setRoundStartTime(performance.now());
      setScreen('game');
    } catch (err) {
      console.error('Failed to start game:', err);
      setError('Failed to load image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [trackSeenImage]);

  /**
   * Timer effect for each guessing phase.
   * Counts down from ROUND_TIME_SECONDS while on the game screen.
   * When the timer expires, automatically submits the current guess (if valid).
   */
  useEffect(() => {
    if (screen !== 'game' || !roundStartTime) {
      return;
    }

    const interval = setInterval(() => {
      const elapsedSeconds = (performance.now() - roundStartTime) / 1000;
      const remaining = Math.max(0, ROUND_TIME_SECONDS - elapsedSeconds);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [screen, roundStartTime]);

  /**
   * Place a marker on the map
   * Returns true if marker was placed, false if click was rejected
   */
  const placeMarker = useCallback((coords: MapCoords): boolean => {
    // Check if click is within the playing area
    if (!isPointInPlayingArea(coords, playingArea)) {
      // Click rejected - not in the playing area
      setClickRejected(true);
      // Auto-clear the rejection state after animation
      setTimeout(() => setClickRejected(false), 500);
      return false;
    }

    setGuessLocation(coords);
    setClickRejected(false);

    // Determine available floors based on region
    const floors = getFloorsForPoint(coords, regions);
    setAvailableFloors(floors);

    // Reset floor selection if current selection is not in available floors
    if (floors === null || (guessFloor && !floors.includes(guessFloor))) {
      setGuessFloor(null);
    }

    return true;
  }, [playingArea, regions, guessFloor]);

  /**
   * Select a floor
   */
  const selectFloor = useCallback((floor: number): void => {
    setGuessFloor(floor);
  }, []);

  /**
   * Submit the guess and calculate score
   */
  const submitGuess = useCallback((): void => {
    // Check if in a region that requires floor selection
    const isInRegion = availableFloors !== null && availableFloors.length > 0;

    if (!guessLocation || !currentImage) {
      console.warn('Cannot submit: missing location or image');
      return;
    }

    if (isInRegion && !guessFloor) {
      console.warn('Cannot submit: missing floor selection for region');
      return;
    }

    // Get correct location and floor from the image data
    const actualLocation: MapCoords = currentImage.correctLocation || { x: 50, y: 50 };
    const actualFloor: number | null = currentImage.correctFloor ?? null;

    // Calculate scores
    const distance = calculateDistance(guessLocation, actualLocation);
    const locationScore = calculateLocationScore(distance);

    // Track how long the guess took (for display only — no effect on scoring)
    let timeTakenSeconds = 0;
    if (roundStartTime) {
      timeTakenSeconds = Math.min(
        ROUND_TIME_SECONDS,
        (performance.now() - roundStartTime) / 1000
      );
    }

    // Floor scoring only applies when in a region AND the photo has a floor set
    let floorCorrect: boolean | null = null;
    let totalScore = locationScore;

    if (isInRegion && guessFloor !== null && actualFloor !== null) {
      floorCorrect = guessFloor === actualFloor;
      // Multiply by 0.8 for incorrect floor instead of bonus system
      totalScore = floorCorrect
        ? locationScore
        : Math.round(locationScore * 0.8);
    }

    // Create result object
    const result: RoundResult = {
      roundNumber: currentRound,
      imageUrl: currentImage.url,
      guessLocation,
      actualLocation,
      guessFloor,
      actualFloor,
      distance,
      locationScore,
      floorCorrect,
      score: totalScore,
      timeTakenSeconds,
      timedOut: timedOutRef.current
    };

    timedOutRef.current = false;

    // Save result
    setCurrentResult(result);
    setRoundResults(prev => [...prev, result]);

    // Show result screen
    setScreen('result');
  }, [guessLocation, guessFloor, availableFloors, currentImage, currentRound, roundStartTime]);

  const submitGuessRef = useRef<() => void>(submitGuess);
  submitGuessRef.current = submitGuess;

  /**
   * When the timer hits zero on the game screen, automatically submit.
   * If there is a valid guess, submit it as a timeout-based submission.
   * If there is no guess at all, go to results with a zero-score "no guess" result.
   */
  useEffect(() => {
    if (screen !== 'game') return;
    if (timeRemaining > 0) return;
    if (!currentImage) return;

    const isInRegion = availableFloors !== null && availableFloors.length > 0;
    const hasValidGuess = guessLocation && (!isInRegion || guessFloor);

    if (hasValidGuess) {
      // Valid guess exists — auto-submit it
      timedOutRef.current = true;
      submitGuessRef.current();
    } else {
      // No guess placed (or incomplete) — go to results with zero score
      const actualLocation: MapCoords = currentImage.correctLocation || { x: 50, y: 50 };
      const actualFloor: number | null = currentImage.correctFloor ?? null;

      const result: RoundResult = {
        roundNumber: currentRound,
        imageUrl: currentImage.url,
        guessLocation: null,
        actualLocation,
        guessFloor: null,
        actualFloor,
        distance: null,
        locationScore: 0,
        floorCorrect: null,
        score: 0,
        timeTakenSeconds: ROUND_TIME_SECONDS,
        timedOut: true,
        noGuess: true
      };

      setCurrentResult(result);
      setRoundResults(prev => [...prev, result]);
      setScreen('result');
    }
  }, [screen, timeRemaining, availableFloors, guessLocation, guessFloor, currentImage, currentRound]);

  /**
   * Proceed to the next round
   */
  const nextRound = useCallback(async (): Promise<void> => {
    if (currentRound >= TOTAL_ROUNDS) {
      // Show final results
      setScreen('finalResults');
      return;
    }

    // Exclude all images already shown this game (ref is authoritative, updated synchronously)
    const excludeIds = Array.from(new Set([
      ...usedInThisGameIdsRef.current,
      ...(currentImage?.id ? [currentImage.id] : [])
    ]));
    const excludeUrls = Array.from(new Set([
      ...usedInThisGameUrlsRef.current,
      ...(currentImage?.url ? [currentImage.url] : [])
    ]));
    const didLoad = await loadNewImage(excludeIds, excludeUrls);
    if (!didLoad) return;

    setCurrentRound(prev => prev + 1);
    setCurrentResult(null);
    setTimeRemaining(ROUND_TIME_SECONDS);
    setRoundStartTime(performance.now());
    setScreen('game');
  }, [currentRound, currentImage?.id, currentImage?.url, loadNewImage]);

  /**
   * View final results (called from last round's result screen)
   */
  const viewFinalResults = useCallback((): void => {
    setScreen('finalResults');
  }, []);

  /**
   * Reset game and return to title screen
   */
  const resetGame = useCallback((): void => {
    setScreen('title');
    setCurrentRound(1);
    setCurrentImage(null);
    setGuessLocation(null);
    setGuessFloor(null);
    setAvailableFloors(null);
    setCurrentResult(null);
    setRoundResults([]);
    setError(null);
    setTimeRemaining(ROUND_TIME_SECONDS);
    setRoundStartTime(null);
    setDifficulty(null);
    setMode(null);
    setLobbyDocId(null);
    setUsedImageIds([]);
    setUsedImageUrls([]);
    usedInThisGameIdsRef.current = [];
    usedInThisGameUrlsRef.current = [];
  }, []);

  return {
    // State
    screen,
    currentRound,
    totalRounds: TOTAL_ROUNDS,
    currentImage,
    guessLocation,
    guessFloor,
    availableFloors,
    currentResult,
    roundResults,
    isLoading,
    error,
    clickRejected,
    playingArea,
    timeRemaining,
    roundTimeSeconds: ROUND_TIME_SECONDS,
    difficulty,
    mode,
    lobbyDocId,

    // Actions
    setScreen,
    startGame,
    placeMarker,
    selectFloor,
    submitGuess,
    nextRound,
    viewFinalResults,
    resetGame,
    setMode,
    setLobbyDocId,
    setDifficulty
  };
}
