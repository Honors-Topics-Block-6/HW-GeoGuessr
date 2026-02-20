import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DuelGameScreen from './DuelGameScreen';

vi.mock('../../services/duelService', () => ({
  STARTING_HEALTH: 5000
}));

describe('DuelGameScreen fullscreen map', () => {
  const defaultProps = {
    imageUrl: 'https://example.com/test-image.jpg',
    guessLocation: null as { x: number; y: number } | null,
    guessFloor: null as number | null,
    availableFloors: null as number[] | null,
    onMapClick: vi.fn(),
    onFloorSelect: vi.fn(),
    onSubmitGuess: vi.fn(),
    onBackToTitle: vi.fn(),
    currentRound: 1,
    clickRejected: false,
    playingArea: null,
    timeRemaining: 15,
    timeLimitSeconds: 20,
    hasSubmitted: false,
    opponentHasSubmitted: false,
    opponentUsername: 'Opponent',
    myHealth: 5000,
    opponentHealth: 5000,
    myUsername: 'You'
  };

  it('shows fullscreen toggle for multiplayer map while guessing', () => {
    render(<DuelGameScreen {...defaultProps} />);

    expect(screen.getByLabelText('Enter fullscreen map')).toBeInTheDocument();
  });

  it('toggles fullscreen map from multiplayer screen', () => {
    const { container } = render(<DuelGameScreen {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Enter fullscreen map'));
    expect(container.querySelector('.map-picker-container')).toHaveClass('is-fullscreen');

    fireEvent.click(screen.getByLabelText('Exit fullscreen map'));
    expect(container.querySelector('.map-picker-container')).not.toHaveClass('is-fullscreen');
  });

  it('closes fullscreen map with Escape in multiplayer screen', () => {
    const { container } = render(<DuelGameScreen {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Enter fullscreen map'));
    expect(container.querySelector('.map-picker-container')).toHaveClass('is-fullscreen');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.map-picker-container')).not.toHaveClass('is-fullscreen');
  });

  describe('Quit button', () => {
    it('should open confirmation modal when Quit clicked', async () => {
      const user = userEvent.setup();
      const onBackToTitle = vi.fn();

      render(<DuelGameScreen {...defaultProps} onBackToTitle={onBackToTitle} />);

      await user.click(screen.getByText('Quit'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Leave Game?')).toBeInTheDocument();
      expect(screen.getByText('Leave Duel')).toBeInTheDocument();
      expect(onBackToTitle).not.toHaveBeenCalled();
    });

    it('should call onBackToTitle when Leave Duel confirmed in modal', async () => {
      const user = userEvent.setup();
      const onBackToTitle = vi.fn();

      render(<DuelGameScreen {...defaultProps} onBackToTitle={onBackToTitle} />);

      await user.click(screen.getByText('Quit'));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByText('Leave Duel'));

      expect(onBackToTitle).toHaveBeenCalledTimes(1);
    });

    it('should not call onBackToTitle when Cancel clicked in modal', async () => {
      const user = userEvent.setup();
      const onBackToTitle = vi.fn();

      render(<DuelGameScreen {...defaultProps} onBackToTitle={onBackToTitle} />);

      await user.click(screen.getByText('Quit'));
      await user.click(screen.getByText('Cancel'));

      expect(onBackToTitle).not.toHaveBeenCalled();
    });
  });
});
