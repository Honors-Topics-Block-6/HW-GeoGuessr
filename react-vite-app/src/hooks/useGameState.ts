import { useState, useCallback, useEffect, useRef } from 'react';
import { getRandomImage, type GameImage as ServiceGameImage } from '../services/imageService';
import { getRegions, getFloorsForPoint, getPlayingArea, isPointInPlayingArea } from '../services/regionService';
import { computeTimeMultiplier } from '../utils/timeScoring';

const TOTAL_ROUNDS = 5;
const MAX_SCORE_PER_ROUND = 5500; // 5000 for location + 500 floor bonus
export const ROUND_TIME_SECONDS = 20;

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
  /** Points deducted due to time (hard mode only) */
  timePenalty?: number;
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
  timePenaltyEnabled: boolean;

  // Actions
  setScreen: React.Dispatch<React.SetStateAction<ScreenState>>;
  startGame: (selectedDifficulty: string, selectedMode?: string, timePenaltyEnabled?: boolean) => Promise<void>;
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

  // Time penalty: slower guesses = fewer points (toggle in difficulty select)
  const [timePenaltyEnabled, setTimePenaltyEnabled] = useState<boolean>(false);

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

  /**
   * Load a new image for the current round
   */
  const loadNewImage = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const image = await getRandomImage(difficulty);
      setCurrentImage(image as GameImage | null);
      setGuessLocation(null);
      setGuessFloor(null);
      setAvailableFloors(null);
      // Timer will be (re)started when the game screen is shown for this image
    } catch (err) {
      console.error('Failed to load image:', err);
      setError('Failed to load image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [difficulty]);

  /**
   * Start a new game - reset everything and fetch first image
   */
  const startGame = useCallback(async (selectedDifficulty: string, selectedMode: string = 'singleplayer', timePenalty: boolean = false): Promise<void> => {
    setCurrentRound(1);
    setRoundResults([]);
    setCurrentResult(null);
    setDifficulty(selectedDifficulty as Difficulty);
    setMode(selectedMode as GameMode);
    setLobbyDocId(null);
    setTimePenaltyEnabled(timePenalty);

    // Multiplayer: go to lobby screen instead of starting a game
    if (selectedMode === 'multiplayer') {
      setScreen('multiplayerLobby');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Reload playing area and regions in case they were updated in the editor
      const [image, fetchedPlayingArea, fetchedRegions] = await Promise.all([
        getRandomImage(selectedDifficulty),
        getPlayingArea(),
        getRegions()
      ]);

      setPlayingArea(fetchedPlayingArea);
      setRegions(fetchedRegions);
      setCurrentImage(image as GameImage | null);
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
  }, []);

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

    // Apply time decay when enabled (points decrease as player takes longer)
    let timePenaltyAmount: number | undefined;
    if (timePenaltyEnabled && totalScore > 0) {
      const timeMultiplier = computeTimeMultiplier(
        timeTakenSeconds,
        ROUND_TIME_SECONDS,
        0.5
      );
      const scoreBeforeTime = totalScore;
      totalScore = Math.round(totalScore * timeMultiplier);
      timePenaltyAmount = scoreBeforeTime - totalScore;
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
      timedOut: timedOutRef.current,
      ...(timePenaltyAmount !== undefined && timePenaltyAmount > 0 && { timePenalty: timePenaltyAmount })
    };

    timedOutRef.current = false;

    // Save result
    setCurrentResult(result);
    setRoundResults(prev => [...prev, result]);

    // Show result screen
    setScreen('result');
  }, [guessLocation, guessFloor, availableFloors, currentImage, currentRound, roundStartTime, timePenaltyEnabled]);

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

    // Increment round
    setCurrentRound(prev => prev + 1);
    setCurrentResult(null);
    setTimeRemaining(ROUND_TIME_SECONDS);
    setRoundStartTime(performance.now());

    // Load new image
    await loadNewImage();
    setScreen('game');
  }, [currentRound, loadNewImage]);

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
    timePenaltyEnabled,

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
