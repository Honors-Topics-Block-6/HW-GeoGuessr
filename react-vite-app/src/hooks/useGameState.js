import { useState, useCallback, useEffect } from 'react';
import { getRandomImage } from '../services/imageService';
import { getRegions, getFloorsForPoint, getPlayingArea, isPointInPlayingArea } from '../services/regionService';

const TOTAL_ROUNDS = 5;
const MAX_SCORE_PER_ROUND = 5500; // 5000 for location + 500 floor bonus

/**
 * Calculate distance between two points (in percentage coordinates)
 */
function calculateDistance(guess, actual) {
  const dx = guess.x - actual.x;
  const dy = guess.y - actual.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate location score based on distance (0-5000 points)
 */
function calculateLocationScore(distance) {
  const maxScore = 5000;
  const decayRate = 0.05;
  const score = Math.round(maxScore * Math.exp(-decayRate * distance));
  return Math.max(0, Math.min(maxScore, score));
}

/**
 * Custom hook for managing game state
 * Handles screen transitions, image loading, multi-round tracking, and scoring
 */
export function useGameState() {
  // Current screen: 'title', 'game', 'result', or 'finalResults'
  const [screen, setScreen] = useState('title');

  // Current round number (1-5)
  const [currentRound, setCurrentRound] = useState(1);

  // Current image being shown
  const [currentImage, setCurrentImage] = useState(null);

  // User's guess location on the map (x, y in percentages)
  const [guessLocation, setGuessLocation] = useState(null);

  // User's guess for the floor
  const [guessFloor, setGuessFloor] = useState(null);

  // Results for the current round (shown on result screen)
  const [currentResult, setCurrentResult] = useState(null);

  // All round results (for final summary)
  const [roundResults, setRoundResults] = useState([]);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Error state
  const [error, setError] = useState(null);

  // Regions from Firestore (for floor selection)
  const [regions, setRegions] = useState([]);

  // Playing area from Firestore (for restricting click area)
  const [playingArea, setPlayingArea] = useState(null);

  // Available floors based on selected location (null if not in a region)
  const [availableFloors, setAvailableFloors] = useState(null);

  // Track when a click is rejected (outside playing area)
  const [clickRejected, setClickRejected] = useState(false);

  // Load regions and playing area on mount
  useEffect(() => {
    async function loadData() {
      const [fetchedRegions, fetchedPlayingArea] = await Promise.all([
        getRegions(),
        getPlayingArea()
      ]);
      setRegions(fetchedRegions);
      setPlayingArea(fetchedPlayingArea);
    }
    loadData();
  }, []);

  /**
   * Load a new image for the current round
   */
  const loadNewImage = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const image = await getRandomImage();
      setCurrentImage(image);
      setGuessLocation(null);
      setGuessFloor(null);
      setAvailableFloors(null);
    } catch (err) {
      console.error('Failed to load image:', err);
      setError('Failed to load image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Start a new game - reset everything and fetch first image
   */
  const startGame = useCallback(async () => {
    setCurrentRound(1);
    setRoundResults([]);
    setCurrentResult(null);

    setIsLoading(true);
    setError(null);

    try {
      // Reload playing area and regions in case they were updated in the editor
      const [image, fetchedPlayingArea, fetchedRegions] = await Promise.all([
        getRandomImage(),
        getPlayingArea(),
        getRegions()
      ]);

      setPlayingArea(fetchedPlayingArea);
      setRegions(fetchedRegions);
      setCurrentImage(image);
      setGuessLocation(null);
      setGuessFloor(null);
      setAvailableFloors(null);
      setScreen('game');
    } catch (err) {
      console.error('Failed to start game:', err);
      setError('Failed to load image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Place a marker on the map
   * Returns true if marker was placed, false if click was rejected
   */
  const placeMarker = useCallback((coords) => {
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
  const selectFloor = useCallback((floor) => {
    setGuessFloor(floor);
  }, []);

  /**
   * Submit the guess and calculate score
   */
  const submitGuess = useCallback(() => {
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
    const actualLocation = currentImage.correctLocation || { x: 50, y: 50 };
    const actualFloor = currentImage.correctFloor || 1;

    // Calculate scores
    const distance = calculateDistance(guessLocation, actualLocation);
    const locationScore = calculateLocationScore(distance);

    // Floor scoring only applies when in a region
    let floorCorrect = null;
    let totalScore = locationScore;

    if (isInRegion && guessFloor !== null) {
      floorCorrect = guessFloor === actualFloor;
      // Multiply by 0.8 for incorrect floor instead of bonus system
      totalScore = floorCorrect ? locationScore : Math.round(locationScore * 0.8);
    }

    // Create result object
    const result = {
      roundNumber: currentRound,
      imageUrl: currentImage.url,
      guessLocation,
      actualLocation,
      guessFloor,
      actualFloor,
      distance,
      locationScore,
      floorCorrect,
      score: totalScore
    };

    // Save result
    setCurrentResult(result);
    setRoundResults(prev => [...prev, result]);

    // Show result screen
    setScreen('result');
  }, [guessLocation, guessFloor, availableFloors, currentImage, currentRound]);

  /**
   * Proceed to the next round
   */
  const nextRound = useCallback(async () => {
    if (currentRound >= TOTAL_ROUNDS) {
      // Show final results
      setScreen('finalResults');
      return;
    }

    // Increment round
    setCurrentRound(prev => prev + 1);
    setCurrentResult(null);

    // Load new image
    await loadNewImage();
    setScreen('game');
  }, [currentRound, loadNewImage]);

  /**
   * View final results (called from last round's result screen)
   */
  const viewFinalResults = useCallback(() => {
    setScreen('finalResults');
  }, []);

  /**
   * Reset game and return to title screen
   */
  const resetGame = useCallback(() => {
    setScreen('title');
    setCurrentRound(1);
    setCurrentImage(null);
    setGuessLocation(null);
    setGuessFloor(null);
    setAvailableFloors(null);
    setCurrentResult(null);
    setRoundResults([]);
    setError(null);
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

    // Actions
    startGame,
    placeMarker,
    selectFloor,
    submitGuess,
    nextRound,
    viewFinalResults,
    resetGame
  };
}
