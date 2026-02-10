import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock the image service
vi.mock('./services/imageService', () => ({
  getRandomImage: vi.fn()
}));

// Mock Firebase
vi.mock('./firebase', () => ({
  db: {},
  storage: {},
  app: {}
}));

import { getRandomImage } from './services/imageService';

const mockImage = {
  id: 'test-1',
  url: 'https://example.com/test-image.jpg',
  correctLocation: { x: 50, y: 50 },
  correctFloor: 2,
  description: 'Test image'
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRandomImage.mockResolvedValue(mockImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial render', () => {
    it('should render the title screen by default', () => {
      render(<App />);

      expect(screen.getByText('HW Geogessr')).toBeInTheDocument();
    });

    it('should render the start game button', () => {
      render(<App />);

      expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
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

  describe('game flow', () => {
    it('should transition to game screen when start game is clicked', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });
    });

    it('should load an image when game starts', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(getRandomImage).toHaveBeenCalled();
      });
    });

    it('should show the current round number', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('1 / 5')).toBeInTheDocument();
      });
    });

    it('should display the loaded image', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByAltText(/mystery location/i)).toHaveAttribute('src', mockImage.url);
      });
    });
  });

  describe('guess submission', () => {
    it('should disable guess button initially', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guess/i })).toBeDisabled();
      });
    });

    it('should enable guess button when location and floor are selected', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Select floor
      await user.click(screen.getByText('2nd'));

      // Click on map (simulate map click)
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        mapPicker.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          right: 100,
          bottom: 100
        });
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guess/i })).not.toBeDisabled();
      });
    });

    it('should show result screen after submitting guess', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Select floor
      await user.click(screen.getByText('2nd'));

      // Click on map
      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        mapPicker.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          right: 100,
          bottom: 100
        });
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

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

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Back'));

      await waitFor(() => {
        expect(screen.getByText('HW Geogessr')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error message when image loading fails', async () => {
      getRandomImage.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to load image/i)).toBeInTheDocument();
      });
    });

    it('should show back to home button on error', async () => {
      getRandomImage.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
      });
    });

    it('should return to title screen when back to home is clicked after error', async () => {
      getRandomImage.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
      });

      getRandomImage.mockResolvedValueOnce(mockImage);
      await user.click(screen.getByRole('button', { name: /back to home/i }));

      await waitFor(() => {
        expect(screen.getByText('HW Geogessr')).toBeInTheDocument();
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
        expect(screen.queryByText('HW Geogessr')).not.toBeInTheDocument();
      });
    });

    it('should return to title screen when back is clicked from submission app', async () => {
      const user = userEvent.setup();

      render(<App />);

      // Open submission app
      await user.click(screen.getByRole('button', { name: /submit photo/i }));

      await waitFor(() => {
        expect(screen.queryByText('HW Geogessr')).not.toBeInTheDocument();
      });

      // Click back to game
      await user.click(screen.getByText('← Back to Game'));

      await waitFor(() => {
        // Should be back on title screen
        expect(screen.getByText('HW Geogessr')).toBeInTheDocument();
      });
    });
  });

  describe('status indicators', () => {
    it('should show incomplete status for location initially', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Location selected').parentElement).not.toHaveClass('complete');
      });
    });

    it('should show incomplete status for floor initially', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Floor selected').parentElement).not.toHaveClass('complete');
      });
    });

    it('should mark floor as complete when selected', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
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

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      // Complete first round
      await user.click(screen.getByText('2nd'));

      const mapPicker = document.querySelector('.map-picker');
      if (mapPicker) {
        mapPicker.getBoundingClientRect = () => ({
          left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
        });
        fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
      }

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
    it('should show final results after completing all 5 rounds', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers({ shouldAdvanceTime: true });

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      // Play through 5 rounds
      for (let round = 1; round <= 5; round++) {
        await waitFor(() => {
          expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
        });

        // Make a guess
        await user.click(screen.getByText('2nd'));

        const mapPicker = document.querySelector('.map-picker');
        if (mapPicker) {
          mapPicker.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
          });
          fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
        }

        await user.click(screen.getByRole('button', { name: /guess/i }));

        await waitFor(() => {
          expect(screen.getByText('Your guess')).toBeInTheDocument();
        });

        vi.advanceTimersByTime(2000);

        if (round < 5) {
          // Next round
          await user.click(screen.getByText('Next Round'));
        } else {
          // Last round - click View Final Results
          await user.click(screen.getByText('View Final Results'));
        }
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

      await user.click(screen.getByRole('button', { name: /start game/i }));

      // Complete 5 rounds quickly
      for (let round = 1; round <= 5; round++) {
        await waitFor(() => {
          expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
        });

        await user.click(screen.getByText('2nd'));

        const mapPicker = document.querySelector('.map-picker');
        if (mapPicker) {
          mapPicker.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
          });
          fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
        }

        await user.click(screen.getByRole('button', { name: /guess/i }));

        await waitFor(() => {
          expect(screen.getByText('Your guess')).toBeInTheDocument();
        });

        vi.advanceTimersByTime(2000);

        if (round < 5) {
          await user.click(screen.getByText('Next Round'));
        } else {
          await user.click(screen.getByText('View Final Results'));
        }
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

      await user.click(screen.getByRole('button', { name: /start game/i }));

      // Complete 5 rounds
      for (let round = 1; round <= 5; round++) {
        await waitFor(() => {
          expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
        });

        await user.click(screen.getByText('2nd'));

        const mapPicker = document.querySelector('.map-picker');
        if (mapPicker) {
          mapPicker.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100
          });
          fireEvent.click(mapPicker, { clientX: 50, clientY: 50 });
        }

        await user.click(screen.getByRole('button', { name: /guess/i }));

        await waitFor(() => {
          expect(screen.getByText('Your guess')).toBeInTheDocument();
        });

        vi.advanceTimersByTime(2000);

        if (round < 5) {
          await user.click(screen.getByText('Next Round'));
        } else {
          await user.click(screen.getByText('View Final Results'));
        }
      }

      await waitFor(() => {
        expect(screen.getByText('Game Complete!')).toBeInTheDocument();
      });

      // Click back to title
      await user.click(screen.getByRole('button', { name: /back to home/i }));

      await waitFor(() => {
        expect(screen.getByText('HW Geogessr')).toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });

  describe('loading states', () => {
    it('should show loading state when starting game', async () => {
      // Make getRandomImage take some time
      getRandomImage.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockImage), 100))
      );

      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      // Button should show loading
      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });
    });

    it('should show loading spinner on game screen during image load', async () => {
      // Create a controllable promise
      let resolveImage;
      getRandomImage.mockImplementation(() => new Promise(resolve => {
        resolveImage = () => resolve(mockImage);
      }));

      const user = userEvent.setup();

      render(<App />);

      // Start the game - this will set screen to 'game' and isLoading to true
      act(() => {
        user.click(screen.getByRole('button', { name: /start game/i }));
      });

      // Wait for the loading button to show (title screen loading)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /loading/i })).toBeInTheDocument();
      });

      // Resolve the image load
      await act(async () => {
        resolveImage();
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

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      await user.click(screen.getByText('3rd'));

      expect(screen.getByText('3rd').closest('button')).toHaveClass('selected');
    });

    it('should allow changing floor selection', async () => {
      const user = userEvent.setup();

      render(<App />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      await waitFor(() => {
        expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
      });

      await user.click(screen.getByText('1st'));
      expect(screen.getByText('1st').closest('button')).toHaveClass('selected');

      await user.click(screen.getByText('3rd'));
      expect(screen.getByText('3rd').closest('button')).toHaveClass('selected');
      expect(screen.getByText('1st').closest('button')).not.toHaveClass('selected');
    });
  });
});
