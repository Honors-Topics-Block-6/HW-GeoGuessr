import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameScreen from './GameScreen';

describe('GameScreen', () => {
  const defaultProps = {
    imageUrl: 'https://example.com/test-image.jpg',
    guessLocation: null,
    guessFloor: null,
    onMapClick: vi.fn(),
    onFloorSelect: vi.fn(),
    onSubmitGuess: vi.fn(),
    onBackToTitle: vi.fn(),
    currentRound: 1,
    totalRounds: 5
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the image panel', () => {
      const { container } = render(<GameScreen {...defaultProps} />);

      expect(container.querySelector('.image-panel')).toBeInTheDocument();
    });

    it('should render the guess panel', () => {
      const { container } = render(<GameScreen {...defaultProps} />);

      expect(container.querySelector('.guess-panel')).toBeInTheDocument();
    });

    it('should render the panel title', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByText('Make Your Guess')).toBeInTheDocument();
    });

    it('should render the back button', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('should render round badge', () => {
      render(<GameScreen {...defaultProps} currentRound={3} totalRounds={5} />);

      expect(screen.getByText('3 / 5')).toBeInTheDocument();
    });
  });

  describe('round display', () => {
    it('should show current round number', () => {
      render(<GameScreen {...defaultProps} currentRound={2} totalRounds={5} />);

      expect(screen.getByText('2 / 5')).toBeInTheDocument();
    });

    it('should update when round changes', () => {
      const { rerender } = render(<GameScreen {...defaultProps} currentRound={1} />);

      expect(screen.getByText('1 / 5')).toBeInTheDocument();

      rerender(<GameScreen {...defaultProps} currentRound={4} />);

      expect(screen.getByText('4 / 5')).toBeInTheDocument();
    });

    it('should use default values if not provided', () => {
      render(<GameScreen {...defaultProps} currentRound={undefined} totalRounds={undefined} />);

      expect(screen.getByText('1 / 5')).toBeInTheDocument();
    });
  });

  describe('back button', () => {
    it('should call onBackToTitle when clicked', async () => {
      const user = userEvent.setup();
      const onBackToTitle = vi.fn();

      render(<GameScreen {...defaultProps} onBackToTitle={onBackToTitle} />);

      await user.click(screen.getByText('Back'));

      expect(onBackToTitle).toHaveBeenCalledTimes(1);
    });
  });

  describe('guess status indicators', () => {
    it('should show incomplete status when no location selected', () => {
      render(<GameScreen {...defaultProps} guessLocation={null} />);

      const statusItems = screen.getAllByText('○');
      expect(statusItems.length).toBeGreaterThan(0);
    });

    it('should show complete status when location is selected', () => {
      render(<GameScreen {...defaultProps} guessLocation={{ x: 50, y: 50 }} />);

      expect(screen.getByText('Location selected').parentElement).toHaveClass('complete');
    });

    it('should show incomplete status when no floor selected', () => {
      render(<GameScreen {...defaultProps} guessFloor={null} />);

      const statusText = screen.getByText('Floor selected');
      expect(statusText.parentElement).not.toHaveClass('complete');
    });

    it('should show complete status when floor is selected', () => {
      render(<GameScreen {...defaultProps} guessFloor={2} />);

      expect(screen.getByText('Floor selected').parentElement).toHaveClass('complete');
    });

    it('should show checkmark for completed items', () => {
      render(<GameScreen {...defaultProps} guessLocation={{ x: 50, y: 50 }} guessFloor={2} />);

      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks).toHaveLength(2);
    });
  });

  describe('submit button state', () => {
    it('should disable guess button when location not selected', () => {
      render(<GameScreen {...defaultProps} guessLocation={null} guessFloor={2} />);

      expect(screen.getByText('Guess').closest('button')).toBeDisabled();
    });

    it('should disable guess button when floor not selected', () => {
      render(<GameScreen {...defaultProps} guessLocation={{ x: 50, y: 50 }} guessFloor={null} />);

      expect(screen.getByText('Guess').closest('button')).toBeDisabled();
    });

    it('should enable guess button when both location and floor selected', () => {
      render(<GameScreen {...defaultProps} guessLocation={{ x: 50, y: 50 }} guessFloor={2} />);

      expect(screen.getByText('Guess').closest('button')).not.toBeDisabled();
    });

    it('should disable guess button when neither selected', () => {
      render(<GameScreen {...defaultProps} guessLocation={null} guessFloor={null} />);

      expect(screen.getByText('Guess').closest('button')).toBeDisabled();
    });
  });

  describe('child components', () => {
    it('should render ImageViewer with correct imageUrl', () => {
      render(<GameScreen {...defaultProps} imageUrl="https://example.com/custom.jpg" />);

      const img = screen.getByAltText(/mystery location/i);
      expect(img).toHaveAttribute('src', 'https://example.com/custom.jpg');
    });

    it('should render MapPicker', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByText('Click to place your guess')).toBeInTheDocument();
    });

    it('should render FloorSelector', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByText('Select Floor')).toBeInTheDocument();
    });

    it('should render GuessButton', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByText('Guess')).toBeInTheDocument();
    });
  });

  describe('guess submission', () => {
    it('should call onSubmitGuess when guess button clicked', async () => {
      const user = userEvent.setup();
      const onSubmitGuess = vi.fn();

      render(
        <GameScreen
          {...defaultProps}
          guessLocation={{ x: 50, y: 50 }}
          guessFloor={2}
          onSubmitGuess={onSubmitGuess}
        />
      );

      await user.click(screen.getByText('Guess'));

      expect(onSubmitGuess).toHaveBeenCalledTimes(1);
    });

    it('should not call onSubmitGuess when button is disabled', async () => {
      const user = userEvent.setup();
      const onSubmitGuess = vi.fn();

      render(
        <GameScreen
          {...defaultProps}
          guessLocation={null}
          guessFloor={null}
          onSubmitGuess={onSubmitGuess}
        />
      );

      const button = screen.getByText('Guess').closest('button');
      await user.click(button);

      expect(onSubmitGuess).not.toHaveBeenCalled();
    });
  });

  describe('floor selection interaction', () => {
    it('should pass onFloorSelect to FloorSelector', async () => {
      const user = userEvent.setup();
      const onFloorSelect = vi.fn();

      render(<GameScreen {...defaultProps} onFloorSelect={onFloorSelect} />);

      // Click on floor 2 button
      await user.click(screen.getByText('2nd'));

      expect(onFloorSelect).toHaveBeenCalledWith(2);
    });

    it('should highlight selected floor', () => {
      render(<GameScreen {...defaultProps} guessFloor={2} />);

      const floorButton = screen.getByText('2nd').closest('button');
      expect(floorButton).toHaveClass('selected');
    });
  });

  describe('accessibility', () => {
    it('should have accessible heading', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Make Your Guess');
    });

    it('should have accessible image', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByAltText(/mystery location/i)).toBeInTheDocument();
    });

    it('should have accessible buttons', () => {
      render(<GameScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /guess/i })).toBeInTheDocument();
    });
  });
});
