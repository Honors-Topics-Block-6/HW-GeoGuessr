import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameState } from './useGameState';

// Mock the imageService
vi.mock('../services/imageService', () => ({
  getRandomImage: vi.fn()
}));

import { getRandomImage } from '../services/imageService';

const mockImage = {
  id: 'test-1',
  url: 'https://example.com/image.jpg',
  correctLocation: { x: 50, y: 50 },
  correctFloor: 2,
  description: 'Test image'
};

describe('useGameState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRandomImage.mockResolvedValue(mockImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with title screen', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.screen).toBe('title');
    });

    it('should start at round 1', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.currentRound).toBe(1);
    });

    it('should have total rounds set to 5', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.totalRounds).toBe(5);
    });

    it('should have no current image', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.currentImage).toBeNull();
    });

    it('should have no guess location', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.guessLocation).toBeNull();
    });

    it('should have no guess floor', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.guessFloor).toBeNull();
    });

    it('should not be loading', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.isLoading).toBe(false);
    });

    it('should have no error', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.error).toBeNull();
    });

    it('should have empty round results', () => {
      const { result } = renderHook(() => useGameState());

      expect(result.current.roundResults).toEqual([]);
    });
  });

  describe('startGame', () => {
    it('should transition to game screen after loading image', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      expect(result.current.screen).toBe('game');
    });

    it('should load an image', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      expect(result.current.currentImage).toEqual(mockImage);
    });

    it('should call getRandomImage', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      expect(getRandomImage).toHaveBeenCalledTimes(1);
    });

    it('should reset round to 1', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      expect(result.current.currentRound).toBe(1);
    });

    it('should clear previous round results', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      expect(result.current.roundResults).toEqual([]);
    });

    it('should set loading state during image fetch', async () => {
      vi.useFakeTimers();

      // Create a promise that we can control
      let resolveImage;
      getRandomImage.mockImplementation(() => new Promise(resolve => {
        resolveImage = () => resolve(mockImage);
      }));

      const { result } = renderHook(() => useGameState());

      // Start the game (this will set isLoading = true before awaiting)
      act(() => {
        result.current.startGame();
      });

      // After act completes, isLoading should be true while waiting for the promise
      expect(result.current.isLoading).toBe(true);

      // Now resolve the promise and let the loading complete
      await act(async () => {
        resolveImage();
      });

      expect(result.current.isLoading).toBe(false);

      vi.useRealTimers();
    });

    it('should handle image loading error', async () => {
      getRandomImage.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      expect(result.current.error).toBe('Failed to load image. Please try again.');
      expect(result.current.screen).toBe('title');
    });

    it('should clear error on successful start', async () => {
      const { result } = renderHook(() => useGameState());

      // First, cause an error
      getRandomImage.mockRejectedValueOnce(new Error('Network error'));
      await act(async () => {
        await result.current.startGame();
      });
      expect(result.current.error).not.toBeNull();

      // Then, start successfully
      getRandomImage.mockResolvedValueOnce(mockImage);
      await act(async () => {
        await result.current.startGame();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('placeMarker', () => {
    it('should set guess location', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 25, y: 75 });
      });

      expect(result.current.guessLocation).toEqual({ x: 25, y: 75 });
    });

    it('should update guess location on subsequent calls', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 25, y: 75 });
      });

      act(() => {
        result.current.placeMarker({ x: 60, y: 40 });
      });

      expect(result.current.guessLocation).toEqual({ x: 60, y: 40 });
    });
  });

  describe('selectFloor', () => {
    it('should set guess floor', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.selectFloor(2);
      });

      expect(result.current.guessFloor).toBe(2);
    });

    it('should update floor on subsequent calls', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.selectFloor(3);
      });

      expect(result.current.guessFloor).toBe(3);
    });
  });

  describe('submitGuess', () => {
    it('should not submit without guess location', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      expect(result.current.screen).toBe('game');
    });

    it('should not submit without guess floor', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.submitGuess();
      });

      expect(result.current.screen).toBe('game');
    });

    it('should not submit without current image and log warning', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useGameState());

      // Don't start game - try to submit directly from title (no currentImage)
      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      // Should warn about missing image
      expect(consoleSpy).toHaveBeenCalledWith('Cannot submit: missing location, floor, or image');
      expect(result.current.screen).toBe('title');

      consoleSpy.mockRestore();
    });

    it('should transition to result screen on valid submission', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.screen).toBe('result');
    });

    it('should calculate correct score for perfect guess', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 }); // Exact match
      });

      act(() => {
        result.current.selectFloor(2); // Correct floor
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.currentResult.score).toBe(5000);
      expect(result.current.currentResult.floorCorrect).toBe(true);
    });

    it('should apply floor penalty for wrong floor', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 }); // Exact match
      });

      act(() => {
        result.current.selectFloor(1); // Wrong floor
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.currentResult.floorCorrect).toBe(false);
      expect(result.current.currentResult.score).toBe(4000); // 5000 * 0.8
    });

    it('should store result in roundResults', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.roundResults).toHaveLength(1);
      expect(result.current.roundResults[0].roundNumber).toBe(1);
    });

    it('should calculate distance correctly', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 53, y: 54 }); // 5 units away (3-4-5 triangle)
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.currentResult.distance).toBe(5);
    });
  });

  describe('nextRound', () => {
    it('should increment round number', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      await act(async () => {
        await result.current.nextRound();
      });

      expect(result.current.currentRound).toBe(2);
    });

    it('should load new image', async () => {
      const newImage = { ...mockImage, id: 'test-2' };
      getRandomImage.mockResolvedValueOnce(mockImage).mockResolvedValueOnce(newImage);

      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      await act(async () => {
        await result.current.nextRound();
      });

      expect(result.current.currentImage).toEqual(newImage);
    });

    it('should clear guess location and floor', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      await act(async () => {
        await result.current.nextRound();
      });

      expect(result.current.guessLocation).toBeNull();
      expect(result.current.guessFloor).toBeNull();
    });

    it('should transition to game screen', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      await act(async () => {
        await result.current.nextRound();
      });

      expect(result.current.screen).toBe('game');
    });

    it('should transition to final results after round 5', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      // Play through 5 rounds
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.placeMarker({ x: 50, y: 50 });
          result.current.selectFloor(2);
          result.current.submitGuess();
        });

        await act(async () => {
          await result.current.nextRound();
        });
      }

      expect(result.current.screen).toBe('finalResults');
    });

    it('should handle image loading error during nextRound', async () => {
      const { result } = renderHook(() => useGameState());

      // Start game successfully
      await act(async () => {
        await result.current.startGame();
      });

      // Complete first round
      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      // Make the next image load fail
      getRandomImage.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await result.current.nextRound();
      });

      // Should set error state
      expect(result.current.error).toBe('Failed to load image. Please try again.');
    });
  });

  describe('viewFinalResults', () => {
    it('should transition to finalResults screen', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      act(() => {
        result.current.viewFinalResults();
      });

      expect(result.current.screen).toBe('finalResults');
    });
  });

  describe('resetGame', () => {
    it('should return to title screen', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.resetGame();
      });

      expect(result.current.screen).toBe('title');
    });

    it('should reset round to 1', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      await act(async () => {
        await result.current.nextRound();
      });

      act(() => {
        result.current.resetGame();
      });

      expect(result.current.currentRound).toBe(1);
    });

    it('should clear all game state', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
        result.current.selectFloor(2);
        result.current.submitGuess();
      });

      act(() => {
        result.current.resetGame();
      });

      expect(result.current.currentImage).toBeNull();
      expect(result.current.guessLocation).toBeNull();
      expect(result.current.guessFloor).toBeNull();
      expect(result.current.currentResult).toBeNull();
      expect(result.current.roundResults).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('scoring algorithm', () => {
    it('should give max score for perfect location', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.currentResult.locationScore).toBe(5000);
    });

    it('should use default location if correctLocation is missing', async () => {
      // Mock an image without correctLocation
      const imageWithoutLocation = {
        id: 'test-no-location',
        url: 'https://example.com/image.jpg',
        // correctLocation is missing
        correctFloor: 2
      };
      getRandomImage.mockResolvedValue(imageWithoutLocation);

      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 }); // Guess at default location
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      // Should use default { x: 50, y: 50 }, so perfect guess = 5000
      expect(result.current.currentResult.actualLocation).toEqual({ x: 50, y: 50 });
      expect(result.current.currentResult.locationScore).toBe(5000);
    });

    it('should use default floor if correctFloor is missing', async () => {
      // Mock an image without correctFloor
      const imageWithoutFloor = {
        id: 'test-no-floor',
        url: 'https://example.com/image.jpg',
        correctLocation: { x: 50, y: 50 }
        // correctFloor is missing
      };
      getRandomImage.mockResolvedValue(imageWithoutFloor);

      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
      });

      act(() => {
        result.current.selectFloor(1); // Guess floor 1, which should be the default
      });

      act(() => {
        result.current.submitGuess();
      });

      // Should use default floor 1
      expect(result.current.currentResult.actualFloor).toBe(1);
      expect(result.current.currentResult.floorCorrect).toBe(true);
    });

    it('should decrease score with distance', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 70, y: 70 }); // ~28 units away
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.currentResult.locationScore).toBeLessThan(5000);
      expect(result.current.currentResult.locationScore).toBeGreaterThan(0);
    });

    it('should use exponential decay for scoring', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 60, y: 50 }); // 10 units away
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      // Expected: 5000 * e^(-0.05 * 10) = 5000 * e^(-0.5) ≈ 3033
      expect(result.current.currentResult.locationScore).toBeCloseTo(3033, -2);
    });
  });

  describe('multi-round gameplay', () => {
    it('should accumulate results across rounds', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      // Round 1
      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      await act(async () => {
        await result.current.nextRound();
      });

      // Round 2
      act(() => {
        result.current.placeMarker({ x: 60, y: 60 });
      });

      act(() => {
        result.current.selectFloor(1);
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.roundResults).toHaveLength(2);
      expect(result.current.roundResults[0].roundNumber).toBe(1);
      expect(result.current.roundResults[1].roundNumber).toBe(2);
    });

    it('should preserve round results after reset and new game', async () => {
      const { result } = renderHook(() => useGameState());

      await act(async () => {
        await result.current.startGame();
      });

      act(() => {
        result.current.placeMarker({ x: 50, y: 50 });
      });

      act(() => {
        result.current.selectFloor(2);
      });

      act(() => {
        result.current.submitGuess();
      });

      expect(result.current.roundResults).toHaveLength(1);

      act(() => {
        result.current.resetGame();
      });

      expect(result.current.roundResults).toEqual([]);
    });
  });
});
