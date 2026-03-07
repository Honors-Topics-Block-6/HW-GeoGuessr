import { useState, useCallback, useEffect, useRef } from 'react';
import { getRandomImage, type GameImage as ServiceGameImage } from '../services/imageService';
import { getRegions, getFloorsForPoint, getPlayingArea, isPointInPlayingArea, getRegionForPoint } from '../services/regionService';
import { STARTING_HEALTH } from '../services/duelService';

const DEFAULT_TOTAL_ROUNDS = 5;
const ALLOWED_TOTAL_ROUNDS = [5, 10, 20] as const;
type TotalRounds = (typeof ALLOWED_TOTAL_ROUNDS)[number];

function coerceTotalRounds(value: unknown): TotalRounds {
  if (ALLOWED_TOTAL_ROUNDS.includes(value as TotalRounds)) return value as TotalRounds;
  return DEFAULT_TOTAL_ROUNDS;
}
const EXACT_SPOT_BONUS_POINTS = 500;
const EXACT_SPOT_MAX_DISTANCE = 1; // map units (~2 ft)
const MAX_SCORE_PER_ROUND = 5500; // 5000 location + 500 exact-spot bonus
/** Default round time (used when no custom setting is provided). */
export const ROUND_TIME_SECONDS = 30;
const SINGLEPLAYER_SEEN_HISTORY_KEY = 'singleplayerSeenImageHistory.v1';
const MAP_DATA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SEEN_HISTORY_ENTRIES = 300;
const RANDOM_GUESS_MAX_ATTEMPTS = 200;

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
  imageBuildingName?: string | null;
  imageDescription?: string | null;
  guessLocation: MapCoords | null;
  actualLocation: MapCoords;
  guessFloor: number | null;
  actualFloor: number | null;
  distance: number | null;
  locationScore: number;
  floorCorrect: boolean | null;
  exactSpotBonus: number;
  score: number;
  timeTakenSeconds: number;
  timedOut: boolean;
  noGuess?: boolean;
  hpLost?: number;
}

export type ScreenState = 'title' | 'modeSelect' | 'game' | 'result' | 'finalResults' | 'multiplayerLobby' | 'waitingRoom' | 'difficultySelect' | 'duelGame' | 'myGames';
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
  isEndlessMode: boolean;
  currentHp: number;
  startingHp: number;

  // Actions
  setScreen: React.Dispatch<React.SetStateAction<ScreenState>>;
  startGame: (
    selectedDifficulty: string,
    selectedMode?: string,
    singleplayerVariant?: 'classic' | 'endless',
    roundTimeSetting?: number,
    totalRoundsSetting?: number
  ) => Promise<void>;
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
 * Uses exponential decay so closer clicks score higher.
 * Only an exact click yields 5000; even small offsets reduce the score a bit.
 */
export function calculateLocationScore(distance: number): number {
  const maxScore = 5000;
  const clampedDistance = Math.max(0, distance);
  // Display uses 1 map unit ≈ 2 feet.
  const feet = clampedDistance * 2;
  // Tunable: smaller = harsher, larger = more forgiving.
  const falloffFeet = 40;

  const ratio = feet / falloffFeet;
  const score = Math.round(maxScore * Math.exp(-(ratio * ratio)));
  return Math.max(0, Math.min(maxScore, score));
}

/**
 * Custom hook for managing game state
 * Handles screen transitions, image loading, multi-round tracking, and scoring
 */
export function useGameState(): UseGameStateReturn {
  const getImageBuildingName = (image: GameImage): string | null => {
    const legacyImage = image as GameImage & { building?: string | null };
    const buildingValue = image.buildingName ?? legacyImage.building;
    if (typeof buildingValue !== 'string') return null;
    const trimmed = buildingValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  // Current screen: 'title', 'game', 'result', or 'finalResults'
  const [screen, setScreen] = useState<ScreenState>('title');

  // Current round number (1-5)
  const [currentRound, setCurrentRound] = useState<number>(1);

  // Total rounds for this singleplayer game (5/10/20)
  const [totalRounds, setTotalRounds] = useState<TotalRounds>(DEFAULT_TOTAL_ROUNDS);

  // Current image being shown
  const [currentImage, setCurrentImage] = useState<GameImage | null>(null);
  // Image IDs used in this game session to prevent repeats within a run
  const [usedImageIds, setUsedImageIds] = useState<string[]>([]);
  const [usedImageUrls, setUsedImageUrls] = useState<string[]>([]);
  const seenImageIdsRef = useRef<string[]>([]);
  const seenImageUrlsRef = useRef<string[]>([]);
  const seenHistoryPersistDisabledRef = useRef<boolean>(false);

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

  // Configurable round time (0 = no time limit). Defaults to ROUND_TIME_SECONDS.
  const [roundTimeSetting, setRoundTimeSetting] = useState<number>(ROUND_TIME_SECONDS);

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

  // Endless mode: HP-based, continues until HP = 0
  const [isEndlessMode, setIsEndlessMode] = useState<boolean>(false);
  const [currentHp, setCurrentHp] = useState<number>(STARTING_HEALTH);
  const mapDataLastFetchedAtRef = useRef<number>(0);
  const mapDataRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const prefetchedImageRef = useRef<GameImage | null>(null);
  const prefetchPromiseRef = useRef<Promise<void> | null>(null);
  const activeImageLoadTokenRef = useRef<number>(0);

  const isImageExcluded = useCallback((image: GameImage, excludeIds: string[], excludeUrls: string[]): boolean => {
    if (image.id && excludeIds.includes(image.id)) return true;
    if (image.url && excludeUrls.includes(image.url)) return true;
    return false;
  }, []);

  const isPrefetchInFlight = useCallback((): boolean => prefetchPromiseRef.current !== null, []);

  const consumePrefetchedImage = useCallback((excludeIds: string[], excludeUrls: string[]): GameImage | null => {
    const prefetchedImage = prefetchedImageRef.current;
    prefetchedImageRef.current = null;
    if (!prefetchedImage) return null;
    if (isImageExcluded(prefetchedImage, excludeIds, excludeUrls)) return null;
    return prefetchedImage;
  }, [isImageExcluded]);

  const canStartPrefetch = useCallback((nextDifficulty: string | null, excludeIds: string[], excludeUrls: string[]): boolean => {
    if (!nextDifficulty) return false;
    if (isPrefetchInFlight()) return false;
    const prefetchedImage = prefetchedImageRef.current;
    if (!prefetchedImage) return true;
    return isImageExcluded(prefetchedImage, excludeIds, excludeUrls);
  }, [isImageExcluded, isPrefetchInFlight]);

  const preloadImageUrl = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const preloader = new Image();
      preloader.decoding = 'async';
      preloader.onload = () => resolve();
      preloader.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
      preloader.src = url;
    });
  }, []);

  const refreshMapData = useCallback(async (forceRefresh = false): Promise<void> => {
    const hasMapData = regions.length > 0 || playingArea !== null;
    const stale = Date.now() - mapDataLastFetchedAtRef.current > MAP_DATA_REFRESH_INTERVAL_MS;
    if (!forceRefresh && hasMapData && !stale) {
      return;
    }

    if (mapDataRefreshPromiseRef.current) {
      return mapDataRefreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const [fetchedRegions, fetchedPlayingArea] = await Promise.all([
          getRegions(),
          getPlayingArea()
        ]);
        setRegions(fetchedRegions);
        setPlayingArea(fetchedPlayingArea);
        mapDataLastFetchedAtRef.current = Date.now();
      } catch (err) {
        console.error('Failed to load regions/playing area:', err);
        setRegions([]);
        setPlayingArea(null);
      }
    })();

    mapDataRefreshPromiseRef.current = refreshPromise.finally(() => {
      mapDataRefreshPromiseRef.current = null;
    });

    return mapDataRefreshPromiseRef.current;
  }, [regions.length, playingArea]);

  const prefetchNextImage = useCallback(async (
    nextDifficulty: string | null,
    excludeIds: string[],
    excludeUrls: string[]
  ): Promise<void> => {
    if (!canStartPrefetch(nextDifficulty, excludeIds, excludeUrls)) {
      return;
    }
    if (prefetchPromiseRef.current) {
      return prefetchPromiseRef.current;
    }

    const prefetchPromise = (async () => {
      try {
        let nextImage = await getRandomImage(nextDifficulty, {
          excludeImageIds: excludeIds,
          excludeImageUrls: excludeUrls
        });
        if (!nextImage && isEndlessMode) {
          nextImage = await getRandomImage(nextDifficulty);
        }
        if (!nextImage || !nextImage.url) {
          prefetchedImageRef.current = null;
          return;
        }

        await preloadImageUrl(nextImage.url);
        prefetchedImageRef.current = nextImage as GameImage;
      } catch (err) {
        console.warn('Failed to prefetch next image:', err);
        prefetchedImageRef.current = null;
      }
    })();

    prefetchPromiseRef.current = prefetchPromise.finally(() => {
      prefetchPromiseRef.current = null;
    });

    return prefetchPromiseRef.current;
  }, [canStartPrefetch, isEndlessMode, preloadImageUrl]);

  // Load regions and playing area on mount
  useEffect(() => {
    void refreshMapData(true);
  }, [refreshMapData]);

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
    if (seenHistoryPersistDisabledRef.current) return;
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
      // Stop retrying if storage quota is exhausted.
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        seenHistoryPersistDisabledRef.current = true;
      }
    }
  }, []);

  const trackSeenImage = useCallback((image: GameImage): void => {
    let changed = false;
    if (image.id && !seenImageIdsRef.current.includes(image.id)) {
      seenImageIdsRef.current = [...seenImageIdsRef.current, image.id].slice(-MAX_SEEN_HISTORY_ENTRIES);
      changed = true;
    }
    if (image.url && !seenImageUrlsRef.current.includes(image.url)) {
      seenImageUrlsRef.current = [...seenImageUrlsRef.current, image.url].slice(-MAX_SEEN_HISTORY_ENTRIES);
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
      const loadStartedAtMs = performance.now();
      const loadToken = ++activeImageLoadTokenRef.current;
      if (prefetchPromiseRef.current) {
        await prefetchPromiseRef.current;
      }

      let image: GameImage | null = consumePrefetchedImage(excludeIds, excludeUrls);

      if (!image) {
        image = await getRandomImage(difficulty, {
          excludeImageIds: excludeIds,
          excludeImageUrls: excludeUrls
        }) as GameImage | null;
      }
      // Fall back to no excludes when: we didn't exclude anything, OR endless mode (allow repeats)
      if (!image && (excludeIds.length === 0 && excludeUrls.length === 0 || isEndlessMode)) {
        image = await getRandomImage(difficulty) as GameImage | null;
      }
      if (!image) {
        setError(excludeIds.length > 0 && excludeUrls.length > 0 && !isEndlessMode
          ? 'No more unique images for this game. Try again with a different difficulty.'
          : 'No approved images are available yet.');
        setCurrentImage(null);
        return false;
      }
      if (loadToken !== activeImageLoadTokenRef.current) {
        return false;
      }
      setCurrentImage(image as GameImage | null);
      if (image?.id) {
        setUsedImageIds((prev) => (prev.includes(image.id) ? prev : [...prev, image.id]));
      }
      if (image?.url) {
        setUsedImageUrls((prev) => (prev.includes(image.url) ? prev : [...prev, image.url]));
      }
      trackSeenImage(image as GameImage);
      setGuessLocation(null);
      setGuessFloor(null);
      setAvailableFloors(null);
      // Timer will be (re)started when the game screen is shown for this image
      console.info(`[loadNewImage] prepared next round image in ${Math.round(performance.now() - loadStartedAtMs)}ms`);
      return true;
    } catch (err) {
      console.error('Failed to load image:', err);
      setError('Failed to load image. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [consumePrefetchedImage, difficulty, usedImageIds, usedImageUrls, trackSeenImage, isEndlessMode]);

  /**
   * Start a new game - reset everything and fetch first image
   */
  const startGame = useCallback(async (
    selectedDifficulty: string,
    selectedMode: string = 'singleplayer',
    singleplayerVariant: 'classic' | 'endless' = 'classic',
    roundTimeSeconds?: number,
    totalRoundsSetting?: number
  ): Promise<void> => {
    const endless = selectedMode === 'singleplayer' && singleplayerVariant === 'endless';
    const effectiveRoundTime = roundTimeSeconds ?? ROUND_TIME_SECONDS;
    const effectiveTotalRounds: TotalRounds =
      selectedMode === 'singleplayer' && !endless
        ? coerceTotalRounds(totalRoundsSetting ?? DEFAULT_TOTAL_ROUNDS)
        : DEFAULT_TOTAL_ROUNDS;
    setCurrentRound(1);
    setTotalRounds(effectiveTotalRounds);
    setRoundResults([]);
    setCurrentResult(null);
    setDifficulty(selectedDifficulty as Difficulty);
    setMode(selectedMode as GameMode);
    setLobbyDocId(null);
    setUsedImageIds([]);
    setUsedImageUrls([]);
    setIsEndlessMode(endless);
    setCurrentHp(STARTING_HEALTH);
    setRoundTimeSetting(effectiveRoundTime);
    prefetchedImageRef.current = null;

    // Multiplayer: go to lobby screen instead of starting a game
    if (selectedMode === 'multiplayer') {
      setScreen('multiplayerLobby');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const startLoadAtMs = performance.now();
      // Do not block game start on map metadata refresh.
      void refreshMapData(false);

      let image = await getRandomImage(selectedDifficulty, {
        excludeImageIds: seenImageIdsRef.current,
        excludeImageUrls: seenImageUrlsRef.current
      });
      if (!image) {
        image = await getRandomImage(selectedDifficulty);
      }
      if (!image) {
        setError('No approved images are available yet.');
        return;
      }

      setCurrentImage(image as GameImage | null);
      if (image?.id) {
        setUsedImageIds([image.id]);
      }
      if (image?.url) {
        setUsedImageUrls([image.url]);
      }
      trackSeenImage(image as GameImage);
      setGuessLocation(null);
      setGuessFloor(null);
      setAvailableFloors(null);
      // Only start the timer if there IS a time limit (> 0)
      setTimeRemaining(effectiveRoundTime > 0 ? effectiveRoundTime : 0);
      setRoundStartTime(effectiveRoundTime > 0 ? performance.now() : null);
      setScreen('game');
      console.info(`[startGame] prepared first round in ${Math.round(performance.now() - startLoadAtMs)}ms`);
    } catch (err) {
      console.error('Failed to start game:', err);
      setError('Failed to load image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [trackSeenImage, refreshMapData]);

  useEffect(() => {
    if (screen !== 'result' || !difficulty) return;
    const excludeIds = usedImageIds;
    const excludeUrls = usedImageUrls;
    if (!canStartPrefetch(difficulty, excludeIds, excludeUrls)) return;
    void prefetchNextImage(difficulty, excludeIds, excludeUrls);
  }, [canStartPrefetch, difficulty, prefetchNextImage, screen, usedImageIds, usedImageUrls]);

  /**
   * Timer effect for each guessing phase.
   * Counts down from roundTimeSetting while on the game screen.
   * Skipped entirely when roundTimeSetting === 0 (no time limit).
   * When the timer expires, automatically submits the current guess (if valid).
   */
  useEffect(() => {
    // No timer when there's no time limit
    if (roundTimeSetting === 0) return;
    if (screen !== 'game' || !roundStartTime) {
      return;
    }

    const interval = setInterval(() => {
      const elapsedSeconds = (performance.now() - roundStartTime) / 1000;
      const remaining = Math.max(0, roundTimeSetting - elapsedSeconds);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [screen, roundStartTime, roundTimeSetting]);

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

  const generateRandomGuessLocation = useCallback((fallbackLocation: MapCoords): MapCoords => {
    for (let attempt = 0; attempt < RANDOM_GUESS_MAX_ATTEMPTS; attempt += 1) {
      const candidate: MapCoords = {
        x: Math.random() * 100,
        y: Math.random() * 100
      };
      if (isPointInPlayingArea(candidate, playingArea)) {
        return candidate;
      }
    }

    if (isPointInPlayingArea(fallbackLocation, playingArea)) {
      return fallbackLocation;
    }

    return { x: 50, y: 50 };
  }, [playingArea]);

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
      const elapsed = (performance.now() - roundStartTime) / 1000;
      timeTakenSeconds = roundTimeSetting > 0 ? Math.min(roundTimeSetting, elapsed) : elapsed;
    }

    // Floor scoring only applies when in a region AND the photo has a floor set.
    // A floor is only "correct" when BOTH building (region) and floor match.
    let floorCorrect: boolean | null = null;
    let exactSpotBonus = 0;
    let totalScore = locationScore;

    if (isInRegion && guessFloor !== null && actualFloor !== null) {
      const guessedRegion = getRegionForPoint(guessLocation, regions);
      const actualRegion = getRegionForPoint(actualLocation, regions);
      const isCorrectBuilding = guessedRegion !== null && actualRegion !== null && guessedRegion.id === actualRegion.id;
      floorCorrect = isCorrectBuilding && guessFloor === actualFloor;
      // Multiply by 0.8 for incorrect floor instead of bonus system
      totalScore = floorCorrect
        ? locationScore
        : Math.round(locationScore * 0.8);

      // Exact-spot bonus applies only when floor is correct and pin is very close.
      if (floorCorrect && distance <= EXACT_SPOT_MAX_DISTANCE) {
        exactSpotBonus = EXACT_SPOT_BONUS_POINTS;
        totalScore += exactSpotBonus;
      }
    }

    // Endless mode: compute HP damage (5000 - score, clamped 0-5000)
    const hpLost = isEndlessMode ? Math.max(0, Math.min(5000, 5000 - totalScore)) : undefined;
    if (isEndlessMode && hpLost !== undefined) {
      setCurrentHp(prev => Math.max(0, prev - hpLost));
    }

    // Create result object
    const result: RoundResult = {
      roundNumber: currentRound,
      imageUrl: currentImage.url,
      imageBuildingName: getImageBuildingName(currentImage),
      imageDescription: currentImage.description ?? null,
      guessLocation,
      actualLocation,
      guessFloor,
      actualFloor,
      distance,
      locationScore,
      floorCorrect,
      exactSpotBonus,
      score: totalScore,
      timeTakenSeconds,
      timedOut: timedOutRef.current,
      hpLost
    };

    timedOutRef.current = false;

    // Save result
    setCurrentResult(result);
    setRoundResults(prev => [...prev, result]);

    // Show result screen
    setScreen('result');
  }, [guessLocation, guessFloor, availableFloors, currentImage, currentRound, roundStartTime, roundTimeSetting, regions, isEndlessMode]);

  const submitGuessRef = useRef<() => void>(submitGuess);
  submitGuessRef.current = submitGuess;

  /**
   * When the timer hits zero on the game screen, automatically submit.
   * If there is a valid guess, submit it as a timeout-based submission.
   * If there is no valid guess, auto-generate a random fallback guess.
   * Skipped when roundTimeSetting === 0 (no time limit).
   */
  useEffect(() => {
    if (roundTimeSetting === 0) return; // No auto-submit for unlimited time
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
      // No guess placed (or incomplete) — submit a random fallback guess
      const actualLocation: MapCoords = currentImage.correctLocation || { x: 50, y: 50 };
      const actualFloor: number | null = currentImage.correctFloor ?? null;
      const randomGuessLocation = guessLocation ?? generateRandomGuessLocation(actualLocation);
      const randomAvailableFloors = getFloorsForPoint(randomGuessLocation, regions);
      const randomGuessFloor = randomAvailableFloors && randomAvailableFloors.length > 0
        ? randomAvailableFloors[Math.floor(Math.random() * randomAvailableFloors.length)] ?? null
        : null;

      const distance = calculateDistance(randomGuessLocation, actualLocation);
      const locationScore = calculateLocationScore(distance);
      const isInRegion = randomAvailableFloors !== null && randomAvailableFloors.length > 0;
      let floorCorrect: boolean | null = null;
      let exactSpotBonus = 0;
      let totalScore = locationScore;

      if (isInRegion && randomGuessFloor !== null && actualFloor !== null) {
        const guessedRegion = getRegionForPoint(randomGuessLocation, regions);
        const actualRegion = getRegionForPoint(actualLocation, regions);
        const isCorrectBuilding = guessedRegion !== null && actualRegion !== null && guessedRegion.id === actualRegion.id;
        floorCorrect = isCorrectBuilding && randomGuessFloor === actualFloor;
        totalScore = floorCorrect
          ? locationScore
          : Math.round(locationScore * 0.8);

        if (floorCorrect && distance <= EXACT_SPOT_MAX_DISTANCE) {
          exactSpotBonus = EXACT_SPOT_BONUS_POINTS;
          totalScore += exactSpotBonus;
        }
      }

      const hpLost = isEndlessMode ? Math.max(0, Math.min(5000, 5000 - totalScore)) : undefined;
      if (isEndlessMode && hpLost !== undefined) {
        setCurrentHp(prev => Math.max(0, prev - hpLost));
      }

      setGuessLocation(randomGuessLocation);
      setGuessFloor(randomGuessFloor);
      setAvailableFloors(randomAvailableFloors);

      const result: RoundResult = {
        roundNumber: currentRound,
        imageUrl: currentImage.url,
        imageBuildingName: getImageBuildingName(currentImage),
        imageDescription: currentImage.description ?? null,
        guessLocation: randomGuessLocation,
        actualLocation,
        guessFloor: randomGuessFloor,
        actualFloor,
        distance,
        locationScore,
        floorCorrect,
        exactSpotBonus,
        score: totalScore,
        timeTakenSeconds: roundTimeSetting,
        timedOut: true,
        noGuess: false,
        hpLost
      };

      setCurrentResult(result);
      setRoundResults(prev => [...prev, result]);
      setScreen('result');
    }
  }, [screen, timeRemaining, availableFloors, guessLocation, guessFloor, currentImage, currentRound, isEndlessMode, roundTimeSetting, generateRandomGuessLocation, regions]);

  /**
   * Proceed to the next round
   */
  const nextRound = useCallback(async (): Promise<void> => {
    // Endless mode: game over when HP reaches 0
    if (isEndlessMode) {
      if (currentHp <= 0) {
        setScreen('finalResults');
        return;
      }
    } else if (currentRound >= totalRounds) {
      setScreen('finalResults');
      return;
    }

    // Exclude only images already used in this game (no repeats within same game).
    // Do not exclude seen refs here — images may repeat across different games.
    const excludeIds = Array.from(new Set([
      ...usedImageIds,
      ...(currentImage?.id ? [currentImage.id] : [])
    ]));
    const excludeUrls = Array.from(new Set([
      ...usedImageUrls,
      ...(currentImage?.url ? [currentImage.url] : [])
    ]));
    const didLoad = await loadNewImage(excludeIds, excludeUrls);
    if (!didLoad) return;

    setCurrentRound(prev => prev + 1);
    setCurrentResult(null);
    setTimeRemaining(roundTimeSetting > 0 ? roundTimeSetting : 0);
    setRoundStartTime(roundTimeSetting > 0 ? performance.now() : null);
    setScreen('game');
  }, [currentRound, totalRounds, currentHp, isEndlessMode, currentImage?.id, currentImage?.url, usedImageIds, usedImageUrls, loadNewImage, roundTimeSetting]);

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
    setTotalRounds(DEFAULT_TOTAL_ROUNDS);
    setCurrentImage(null);
    setGuessLocation(null);
    setGuessFloor(null);
    setAvailableFloors(null);
    setCurrentResult(null);
    setRoundResults([]);
    setError(null);
    setTimeRemaining(ROUND_TIME_SECONDS);
    setRoundStartTime(null);
    setRoundTimeSetting(ROUND_TIME_SECONDS);
    setDifficulty(null);
    setMode(null);
    setLobbyDocId(null);
    setUsedImageIds([]);
    setUsedImageUrls([]);
    setIsEndlessMode(false);
    setCurrentHp(STARTING_HEALTH);
    prefetchedImageRef.current = null;
  }, []);

  return {
    // State
    screen,
    currentRound,
    totalRounds,
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
    roundTimeSeconds: roundTimeSetting,
    difficulty,
    mode,
    lobbyDocId,
    isEndlessMode,
    currentHp,
    startingHp: STARTING_HEALTH,

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
