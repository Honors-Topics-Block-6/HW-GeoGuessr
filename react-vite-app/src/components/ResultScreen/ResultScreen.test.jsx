import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultScreen from './ResultScreen';

describe('ResultScreen', () => {
  const defaultProps = {
    guessLocation: { x: 50, y: 50 },
    guessFloor: 2,
    actualLocation: { x: 50, y: 50 },
    actualFloor: 2,
    imageUrl: 'https://example.com/image.jpg',
    roundNumber: 1,
    totalRounds: 5,
    onNextRound: vi.fn(),
    onViewFinalResults: vi.fn(),
    isLastRound: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Only run pending timers if fake timers are active
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  describe('rendering', () => {
    it('should render the result screen', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      expect(container.querySelector('.result-screen')).toBeInTheDocument();
    });

    it('should render the round indicator', () => {
      render(<ResultScreen {...defaultProps} roundNumber={3} totalRounds={5} />);

      expect(screen.getByText('Round 3 of 5')).toBeInTheDocument();
    });

    it('should render the map image', () => {
      render(<ResultScreen {...defaultProps} />);

      expect(screen.getByAltText('Campus Map')).toBeInTheDocument();
    });

    it('should render the location image preview', () => {
      render(<ResultScreen {...defaultProps} />);

      expect(screen.getByAltText('Location')).toHaveAttribute('src', defaultProps.imageUrl);
    });

    it('should render progress dots', () => {
      const { container } = render(<ResultScreen {...defaultProps} totalRounds={5} />);

      const dots = container.querySelectorAll('.progress-dot');
      expect(dots).toHaveLength(5);
    });
  });

  describe('score display', () => {
    it('should display score label', () => {
      render(<ResultScreen {...defaultProps} />);

      expect(screen.getByText('Score')).toBeInTheDocument();
    });

    it('should display max score indicator', () => {
      render(<ResultScreen {...defaultProps} />);

      expect(screen.getByText('/ 5,000')).toBeInTheDocument();
    });

    it('should show score after animation completes', () => {
      render(<ResultScreen {...defaultProps} />);

      // Fast forward through animations
      act(() => {
        vi.advanceTimersByTime(2500);
      });

      // Multiple elements will have 5,000 (score display and breakdown)
      expect(screen.getAllByText('5,000').length).toBeGreaterThan(0);
    });
  });

  describe('markers', () => {
    it('should render guess marker', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      expect(container.querySelector('.guess-marker')).toBeInTheDocument();
    });

    it('should position guess marker correctly', () => {
      const { container } = render(
        <ResultScreen {...defaultProps} guessLocation={{ x: 25, y: 75 }} />
      );

      const guessMarker = container.querySelector('.guess-marker');
      expect(guessMarker).toHaveStyle({ left: '25%', top: '75%' });
    });

    it('should render actual location marker after animation', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      // Fast forward to reveal actual marker
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(container.querySelector('.actual-marker')).toBeInTheDocument();
    });

    it('should render "Your guess" label on guess marker', () => {
      render(<ResultScreen {...defaultProps} />);

      expect(screen.getByText('Your guess')).toBeInTheDocument();
    });

    it('should render "Correct" label on actual marker after animation', () => {
      render(<ResultScreen {...defaultProps} />);

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText('Correct')).toBeInTheDocument();
    });
  });

  describe('result line', () => {
    it('should render SVG line between markers after animation', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(container.querySelector('.result-line')).toBeInTheDocument();
    });

    it('should position line endpoints correctly', () => {
      const { container } = render(
        <ResultScreen
          {...defaultProps}
          guessLocation={{ x: 20, y: 30 }}
          actualLocation={{ x: 70, y: 80 }}
        />
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const line = container.querySelector('.result-line');
      expect(line).toHaveAttribute('x1', '20%');
      expect(line).toHaveAttribute('y1', '30%');
      expect(line).toHaveAttribute('x2', '70%');
      expect(line).toHaveAttribute('y2', '80%');
    });
  });

  describe('floor scoring', () => {
    it('should show correct floor message when floor matches', () => {
      render(<ResultScreen {...defaultProps} guessFloor={2} actualFloor={2} />);

      expect(screen.getByText(/Correct!/)).toBeInTheDocument();
    });

    it('should show wrong floor message when floor differs', () => {
      render(<ResultScreen {...defaultProps} guessFloor={1} actualFloor={2} />);

      expect(screen.getByText(/You: 1 \| Actual: 2/)).toBeInTheDocument();
    });

    it('should apply penalty styling for wrong floor', () => {
      const { container } = render(
        <ResultScreen {...defaultProps} guessFloor={1} actualFloor={2} />
      );

      expect(container.querySelector('.incorrect')).toBeInTheDocument();
    });

    it('should show floor penalty in breakdown when wrong', () => {
      render(<ResultScreen {...defaultProps} guessFloor={1} actualFloor={2} />);

      expect(screen.getByText('Wrong Floor (-20%)')).toBeInTheDocument();
    });

    it('should not show floor penalty when floor is correct', () => {
      render(<ResultScreen {...defaultProps} guessFloor={2} actualFloor={2} />);

      expect(screen.queryByText('Wrong Floor (-20%)')).not.toBeInTheDocument();
    });
  });

  describe('next round button', () => {
    it('should show "Next Round" for non-last rounds', () => {
      render(<ResultScreen {...defaultProps} isLastRound={false} />);

      expect(screen.getByText('Next Round')).toBeInTheDocument();
    });

    it('should show "View Final Results" for last round', () => {
      render(<ResultScreen {...defaultProps} isLastRound={true} />);

      expect(screen.getByText('View Final Results')).toBeInTheDocument();
    });

    it('should call onNextRound when Next Round clicked', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onNextRound = vi.fn();

      render(<ResultScreen {...defaultProps} onNextRound={onNextRound} isLastRound={false} />);

      await user.click(screen.getByText('Next Round'));

      expect(onNextRound).toHaveBeenCalledTimes(1);
    });

    it('should call onViewFinalResults when View Final Results clicked', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onViewFinalResults = vi.fn();

      render(
        <ResultScreen
          {...defaultProps}
          onViewFinalResults={onViewFinalResults}
          isLastRound={true}
        />
      );

      await user.click(screen.getByText('View Final Results'));

      expect(onViewFinalResults).toHaveBeenCalledTimes(1);
    });
  });

  describe('distance display', () => {
    it('should show "Perfect!" for zero distance', () => {
      render(
        <ResultScreen
          {...defaultProps}
          guessLocation={{ x: 50, y: 50 }}
          actualLocation={{ x: 50, y: 50 }}
        />
      );

      // May have multiple 'Perfect!' texts on the page
      expect(screen.getAllByText('Perfect!').length).toBeGreaterThan(0);
    });

    it('should show distance in feet for moderate distance (5-20 units)', () => {
      // Distance that gives units between 5 and 20 after * 2
      // sqrt((dx)^2 + (dy)^2) = 5 => dx=3, dy=4 gives distance=5
      // 5 * 2 = 10 units, which is >= 5 and < 20
      render(
        <ResultScreen
          {...defaultProps}
          guessLocation={{ x: 53, y: 54 }}
          actualLocation={{ x: 50, y: 50 }}
        />
      );

      // Distance is 5, * 2 = 10 ft
      expect(screen.getByText('10 ft away')).toBeInTheDocument();
    });

    it('should show distance in feet for larger distance (>= 20 units)', () => {
      render(
        <ResultScreen
          {...defaultProps}
          guessLocation={{ x: 50, y: 50 }}
          actualLocation={{ x: 60, y: 60 }}
        />
      );

      // Distance is ~14.14, * 2 = ~28 ft
      expect(screen.getByText(/\d+ ft away/)).toBeInTheDocument();
    });

    it('should show "Perfect!" for very small distance (units < 5)', () => {
      // Distance that gives units < 5 after * 2
      // 2 / 2 = 1 distance
      render(
        <ResultScreen
          {...defaultProps}
          guessLocation={{ x: 51, y: 50 }}
          actualLocation={{ x: 50, y: 50 }}
        />
      );

      // Distance is 1, * 2 = 2 units < 5, so should show "Perfect!"
      expect(screen.getAllByText('Perfect!').length).toBeGreaterThan(0);
    });
  });

  describe('score breakdown', () => {
    it('should show location score', () => {
      render(<ResultScreen {...defaultProps} />);

      expect(screen.getByText('Location Score')).toBeInTheDocument();
    });

    it('should show total score', () => {
      render(<ResultScreen {...defaultProps} />);

      expect(screen.getByText('Total')).toBeInTheDocument();
    });
  });

  describe('progress dots', () => {
    it('should mark completed rounds', () => {
      const { container } = render(
        <ResultScreen {...defaultProps} roundNumber={3} totalRounds={5} />
      );

      const completedDots = container.querySelectorAll('.progress-dot.completed');
      expect(completedDots).toHaveLength(3);
    });

    it('should mark current round', () => {
      const { container } = render(
        <ResultScreen {...defaultProps} roundNumber={3} totalRounds={5} />
      );

      const currentDots = container.querySelectorAll('.progress-dot.current');
      expect(currentDots).toHaveLength(1);
    });
  });

  describe('animation phases', () => {
    it('should start in animation phase 0', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      // Initially, actual marker should not be visible
      expect(container.querySelector('.actual-marker')).not.toBeInTheDocument();
    });

    it('should show actual marker in phase 1', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(container.querySelector('.actual-marker')).toBeInTheDocument();
    });

    it('should show line in phase 2', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      act(() => {
        vi.advanceTimersByTime(900);
      });

      expect(container.querySelector('.result-line')).toBeInTheDocument();
    });

    it('should show score in phase 3', () => {
      const { container } = render(<ResultScreen {...defaultProps} />);

      act(() => {
        vi.advanceTimersByTime(1400);
      });

      expect(container.querySelector('.score-display.visible')).toBeInTheDocument();
    });
  });

  describe('score animation', () => {
    it('should animate score from 0 to final value', () => {
      render(
        <ResultScreen
          {...defaultProps}
          guessLocation={{ x: 50, y: 50 }}
          actualLocation={{ x: 50, y: 50 }}
          guessFloor={2}
          actualFloor={2}
        />
      );

      // Start score animation phase
      act(() => {
        vi.advanceTimersByTime(1400);
      });

      // Score should start animating
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // After animation, should show full score
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Multiple elements will have 5,000 (score display and breakdown)
      expect(screen.getAllByText('5,000').length).toBeGreaterThan(0);
    });
  });
});
