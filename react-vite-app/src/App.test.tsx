import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock the image service
vi.mock('./services/imageService', () => ({
  getRandomImage: vi.fn()
}));

// Mock the region service to return a region that covers the test area
vi.mock('./services/regionService', () => ({
  getRegions: vi.fn().mockResolvedValue([
    {
      id: 'test-region',
      name: 'Test Building',
      floors: [1, 2, 3],
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
    }
  ]),
  getPlayingArea: vi.fn().mockResolvedValue(null),
  getFloorsForPoint: vi.fn().mockReturnValue([1, 2, 3]),
  getRegionForPoint: vi.fn().mockReturnValue({ id: 'test-region' }),
  isPointInPlayingArea: vi.fn().mockReturnValue(true),
  isPointInPolygon: vi.fn().mockReturnValue(true)
}));

// Mock Firebase
vi.mock('./firebase', () => ({
  db: {},
  app: {},
  auth: {}
}));

// Mock presence hook (no-op in tests)
vi.mock('./hooks/usePresence', () => ({
  usePresence: vi.fn()
}));

// Mock admin messages hook
vi.mock('./hooks/useAdminMessages', () => ({
  useAdminMessages: vi.fn(() => ({
    messages: [],
    dismissMessage: vi.fn()
  }))
}));

// Mock AuthContext to provide a fake authenticated user
vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'test-uid', email: 'test@example.com' },
    userDoc: { uid: 'test-uid', username: 'TestUser', email: 'test@example.com' },
    loading: false,
    needsUsername: false,
    isAdmin: false,
    hasPermission: () => false,
    logout: vi.fn(),
    updateUsername: vi.fn(),
    totalXp: 0,
    refreshUserDoc: vi.fn(),
    levelInfo: {
      level: 1,
      currentLevelXp: 10000,
      xpIntoLevel: 0,
      xpToNextLevel: 10000,
      progress: 0
    },
    levelTitle: 'Newcomer',
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { getRandomImage } from './services/imageService';

const mockedGetRandomImage = vi.mocked(getRandomImage);

import type { GameImage } from './services/imageService';

const mockImage: GameImage = {
  id: 'test-1',
  url: 'https://example.com/test-image.jpg',
  correctLocation: { x: 50, y: 50 },
  correctFloor: 2,
  difficulty: 'easy',
  description: 'Test image'
};

/**
 * Helper: navigate from title screen through difficulty select to the game screen.
 * Clicks Play on title -> selects Easy difficulty -> clicks Play on difficulty select.
 */
const navigateToGame = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  // Click Play on title screen to go to difficulty select
  await user.click(screen.getByRole('button', { name: /^play$/i }));

  // Wait for difficulty select screen
  await waitFor(() => {
    expect(screen.getByText('Choose Difficulty')).toBeInTheDocument();
  });

  // Select Easy difficulty
  await user.click(screen.getByText('Easy'));

  // Click Play on difficulty select to start the game
  await user.click(screen.getByRole('button', { name: /^play$/i }));
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetRandomImage.mockResolvedValue(mockImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial render', () => {
    it('should render the title screen by default', () => {
      render(<App />);

      expect(screen.getByText('HW Geoguessr')).toBeInTheDocument();
    });

    it('should render the play button', () => {
      render(<App />);

      expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    });

    it('should render the submit photo button', () => {
      render(<App />);

      expect(screen.getByRole('button', { name: /submit photo/i })).toBeInTheDocument();
    });

    it('should have the app container class', () => {
      const { container } = render(<App />);

      expect(container.querySelector('.app')).toBeInTheDocument();
    });
  });

  describe('difficulty select flow', () => {
    it('should show difficulty select screen when play is clicked', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /^play$/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose Difficulty')).toBeInTheDocument();
      });
    });

    it('should return to title screen when back is clicked from difficulty select', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /^play$/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose Difficulty')).toBeInTheDocument();
      });

      await user.click(screen.getByText('\u2190 Back'));

      await waitFor(() => {
        expect(screen.getByText('HW Geoguessr')).toBeInTheDocument();
      });
    });
  });

  describe('game flow', () => {
    it('should transition to game screen when difficulty is selected and play is clicked', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });
    });

    it('should load an image when game starts', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(mockedGetRandomImage).toHaveBeenCalled();
      });
    });

    it('should show the current round number', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('1 / 5')).toBeInTheDocument();
      });
    });

    it('should display the loaded image', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByAltText(/mystery location/i)).toHaveAttribute('src', mockImage.url);
      });
    });
  });

  describe('guess submission', () => {
    it('should disable guess button initially', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guess/i })).toBeDisabled();
      });
    });

    it('should enable guess button when location and floor are selected', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Click on map first to trigger floor availability
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          right: 100,
          bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Wait for floor selector to appear, then select floor
      await waitFor(() => {
        expect(screen.getByText('2nd')).toBeInTheDocument();
      });
      await user.click(screen.getByText('2nd'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guess/i })).not.toBeDisabled();
      });
    });

    it('should show result screen after submitting guess', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Click on map first to trigger floor availability
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          right: 100,
          bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Wait for floor selector to appear, then select floor
      await waitFor(() => {
        expect(screen.getByText('2nd')).toBeInTheDocument();
      });
      await user.click(screen.getByText('2nd'));

      // Submit guess
      await user.click(screen.getByRole('button', { name: /guess/i }));

      await waitFor(() => {
        expect(screen.getByText('Your guess')).toBeInTheDocument();
      });
    });
  });

  describe('back navigation', () => {
    it('should return to title screen when back button is clicked', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Back'));

      await waitFor(() => {
        expect(screen.getByText('HW Geoguessr')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error message when image loading fails', async () => {
      mockedGetRandomImage.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText(/failed to load image/i)).toBeInTheDocument();
      });
    });

    it('should show back to home button on error', async () => {
      mockedGetRandomImage.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
      });
    });

    it('should return to title screen when back to home is clicked after error', async () => {
      mockedGetRandomImage.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
      });

      mockedGetRandomImage.mockResolvedValueOnce(mockImage);
      await user.click(screen.getByRole('button', { name: /back to home/i }));

      await waitFor(() => {
        expect(screen.getByText('HW Geoguessr')).toBeInTheDocument();
      });
    });
  });

  describe('submission app navigation', () => {
    it('should show submission app when submit photo is clicked', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /submit photo/i }));

      await waitFor(() => {
        // SubmissionApp should be rendered
        expect(screen.queryByText('HW Geoguessr')).not.toBeInTheDocument();
      });
    });

    it('should return to title screen when back is clicked from submission app', async () => {
      const user = userEvent.setup();

      render(<App />);

      // Open submission app
      await user.click(screen.getByRole('button', { name: /submit photo/i }));

      await waitFor(() => {
        expect(screen.queryByText('HW Geoguessr')).not.toBeInTheDocument();
      });

      // Click back to game
      await user.click(screen.getByText('\u2190 Back to Game'));

      await waitFor(() => {
        // Should be back on title screen
        expect(screen.getByText('HW Geoguessr')).toBeInTheDocument();
      });
    });
  });

  describe('status indicators', () => {
    it('should show incomplete status for location initially', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Location selected').parentElement).not.toHaveClass('complete');
      });
    });

    it('should show floor status after clicking on map in a region', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Floor selector should not be visible initially (before clicking on map)
      expect(screen.queryByText('Floor selected')).not.toBeInTheDocument();

      // Click on map to trigger floor availability
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Now floor selector should be visible
      await waitFor(() => {
        expect(screen.getByText('Floor selected').parentElement).not.toHaveClass('complete');
      });
    });

    it('should mark floor as complete when selected', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Click on map first to make floor selector available
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Wait for floor selector to appear
      await waitFor(() => {
        expect(screen.getByText('2nd')).toBeInTheDocument();
      });

      await user.click(screen.getByText('2nd'));

      await waitFor(() => {
        expect(screen.getByText('Floor selected').parentElement).toHaveClass('complete');
      });
    });
  });

  describe('multi-round gameplay', () => {
    it('should increment round after next round is clicked', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Click on map first to trigger floor availability
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Wait for floor selector to appear, then select floor
      await waitFor(() => {
        expect(screen.getByText('2nd')).toBeInTheDocument();
      });
      await user.click(screen.getByText('2nd'));

      await user.click(screen.getByRole('button', { name: /guess/i }));

      // Wait for result screen
      await waitFor(() => {
        expect(screen.getByText('Your guess')).toBeInTheDocument();
      });

      // Advance timers to complete animations
      vi.advanceTimersByTime(2000);

      // Click next round
      await user.click(screen.getByText('Next Round'));

      await waitFor(() => {
        expect(screen.getByText('2 / 5')).toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });

  describe('final results screen', () => {
    // Helper function to complete a round
    const completeRound = async (user: ReturnType<typeof userEvent.setup>, isLastRound: boolean): Promise<void> => {
      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Click on map first to trigger floor availability
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Wait for floor selector to appear, then select floor
      await waitFor(() => {
        expect(screen.getByText('2nd')).toBeInTheDocument();
      });
      await user.click(screen.getByText('2nd'));

      await user.click(screen.getByRole('button', { name: /guess/i }));

      await waitFor(() => {
        expect(screen.getByText('Your guess')).toBeInTheDocument();
      });

      vi.advanceTimersByTime(2000);

      if (!isLastRound) {
        await user.click(screen.getByText('Next Round'));
      } else {
        await user.click(screen.getByText('View Final Results'));
      }
    };

    it('should show final results after completing all 5 rounds', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      render(<App />);

      await navigateToGame(user);

      // Play through 5 rounds
      for (let round = 1; round <= 5; round++) {
        await completeRound(user, round === 5);
      }

      // Should be on final results screen
      await waitFor(() => {
        expect(screen.getByText('Game Complete!')).toBeInTheDocument();
      });

      vi.useRealTimers();
    });

    it('should show play again button on final results', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      render(<App />);

      await navigateToGame(user);

      // Complete 5 rounds
      for (let round = 1; round <= 5; round++) {
        await completeRound(user, round === 5);
      }

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
      });

      vi.useRealTimers();
    });

    it('should return to title from final results', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      render(<App />);

      await navigateToGame(user);

      // Complete 5 rounds
      for (let round = 1; round <= 5; round++) {
        await completeRound(user, round === 5);
      }

      await waitFor(() => {
        expect(screen.getByText('Game Complete!')).toBeInTheDocument();
      });

      // Click back to title
      await user.click(screen.getByRole('button', { name: /back to home/i }));

      await waitFor(() => {
        expect(screen.getByText('HW Geoguessr')).toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });

  describe('loading states', () => {
    it('should show loading state when starting game from difficulty select', async () => {
      // Make getRandomImage take some time
      mockedGetRandomImage.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockImage), 100))
      );

      const user = userEvent.setup();

      render(<App />);

      // Navigate to difficulty select
      await user.click(screen.getByRole('button', { name: /^play$/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose Difficulty')).toBeInTheDocument();
      });

      // Select difficulty
      await user.click(screen.getByText('Easy'));

      // Click Play on difficulty select to start the game
      await user.click(screen.getByRole('button', { name: /^play$/i }));

      // Button should show loading on difficulty select screen
      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });
    });

    it('should show loading spinner on game screen during image load', async () => {
      // Create a controllable promise
      let resolveImage: (() => void) | undefined;
      mockedGetRandomImage.mockImplementation(() => new Promise(resolve => {
        resolveImage = () => resolve(mockImage);
      }));

      const user = userEvent.setup();

      render(<App />);

      // Navigate to difficulty select
      await user.click(screen.getByRole('button', { name: /^play$/i }));

      await waitFor(() => {
        expect(screen.getByText('Choose Difficulty')).toBeInTheDocument();
      });

      // Select difficulty and click Play
      await user.click(screen.getByText('Easy'));

      // Start the game - this will call startGame which sets isLoading to true
      act(() => {
        user.click(screen.getByRole('button', { name: /^play$/i }));
      });

      // Wait for the loading button to show (difficulty select loading)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /loading/i })).toBeInTheDocument();
      });

      // Resolve the image load
      await act(async () => {
        resolveImage!();
      });

      // Should now show the game
      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });
    });
  });

  describe('floor selection', () => {
    it('should highlight selected floor', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Click on map first to trigger floor availability
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Wait for floor selector to appear
      await waitFor(() => {
        expect(screen.getByText('3rd')).toBeInTheDocument();
      });

      await user.click(screen.getByText('3rd'));

      expect(screen.getByText('3rd').closest('button')).toHaveClass('selected');
    });

    it('should allow changing floor selection', async () => {
      const user = userEvent.setup();

      render(<App />);

      await navigateToGame(user);

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Click on map first to trigger floor availability
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        (mapPicker as HTMLElement).getBoundingClientRect = () => ({
          left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
        } as DOMRect);
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      // Wait for floor selector to appear
      await waitFor(() => {
        expect(screen.getByText('1st')).toBeInTheDocument();
      });

      await user.click(screen.getByText('1st'));
      expect(screen.getByText('1st').closest('button')).toHaveClass('selected');

      await user.click(screen.getByText('3rd'));
      expect(screen.getByText('3rd').closest('button')).toHaveClass('selected');
      expect(screen.getByText('1st').closest('button')).not.toHaveClass('selected');
    });
  });
});
