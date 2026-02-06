import { useState, useCallback } from 'react';
import { getRandomImage } from '../services/imageService';

/**
 * Custom hook for managing game state
 * Handles screen transitions, image loading, and guess tracking
 */
export function useGameState() {
  // Current screen: 'title' or 'game'
  const [screen, setScreen] = useState('title');

  // Current image being shown
  const [currentImage, setCurrentImage] = useState(null);

  // User's guess location on the map (x, y in percentages)
  const [guessLocation, setGuessLocation] = useState(null);

  // User's guess for the floor
  const [guessFloor, setGuessFloor] = useState(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Error state
  const [error, setError] = useState(null);

  /**
   * Start a new game - fetch a random image and show game screen
   */
  const startGame = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const image = await getRandomImage();
      setCurrentImage(image);
      setGuessLocation(null);
      setGuessFloor(null);
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
   */
  const placeMarker = useCallback((coords) => {
    setGuessLocation(coords);
  }, []);

  /**
   * Select a floor
   */
  const selectFloor = useCallback((floor) => {
    setGuessFloor(floor);
  }, []);

  /**
   * Submit the guess
   */
  const submitGuess = useCallback(() => {
    if (!guessLocation || !guessFloor) {
      console.warn('Cannot submit: missing location or floor');
      return;
    }

    // Log the guess for now (scoring will be implemented later)
    console.log('Guess submitted:', {
      location: guessLocation,
      floor: guessFloor,
      image: currentImage
    });

    // Show an alert with the guess (placeholder for result screen)
    alert(
      `Guess submitted!\n\n` +
      `Location: (${guessLocation.x.toFixed(1)}%, ${guessLocation.y.toFixed(1)}%)\n` +
      `Floor: ${guessFloor}\n\n` +
      `(Result screen coming soon!)`
    );

    // For now, go back to title screen after guess
    resetGame();
  }, [guessLocation, guessFloor, currentImage]);

  /**
   * Reset game and return to title screen
   */
  const resetGame = useCallback(() => {
    setScreen('title');
    setCurrentImage(null);
    setGuessLocation(null);
    setGuessFloor(null);
    setError(null);
  }, []);

  return {
    // State
    screen,
    currentImage,
    guessLocation,
    guessFloor,
    isLoading,
    error,

    // Actions
    startGame,
    placeMarker,
    selectFloor,
    submitGuess,
    resetGame
  };
}
