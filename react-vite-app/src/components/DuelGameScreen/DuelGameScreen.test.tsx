import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
