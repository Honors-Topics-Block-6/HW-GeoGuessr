import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FinalResultsScreen from './FinalResultsScreen';

describe('FinalResultsScreen', () => {
  const createMockRound = (overrides = {}) => ({
    roundNumber: 1,
    imageUrl: 'https://example.com/image.jpg',
    guessLocation: { x: 50, y: 50 },
    actualLocation: { x: 50, y: 50 },
    guessFloor: 2,
    actualFloor: 2,
    distance: 0,
    locationScore: 5000,
    floorCorrect: true,
    score: 5000,
    ...overrides
  });

  const defaultProps = {
    rounds: [
      createMockRound({ roundNumber: 1, score: 5000, locationScore: 5000, floorCorrect: true }),
      createMockRound({ roundNumber: 2, score: 4000, locationScore: 4000, floorCorrect: true }),
      createMockRound({ roundNumber: 3, score: 3000, locationScore: 3000, floorCorrect: true }),
      createMockRound({ roundNumber: 4, score: 4500, locationScore: 4500, floorCorrect: true }),
      createMockRound({ roundNumber: 5, score: 3500, locationScore: 3500, floorCorrect: true })
    ],
    onPlayAgain: vi.fn(),
    onBackToTitle: vi.fn()
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
    it('should render the final results screen', () => {
      const { container } = render(<FinalResultsScreen {...defaultProps} />);

      expect(container.querySelector('.final-results-screen')).toBeInTheDocument();
    });

    it('should render "Game Complete!" title', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      expect(screen.getByText('Game Complete!')).toBeInTheDocument();
    });

    it('should render the total score container', () => {
      const { container } = render(<FinalResultsScreen {...defaultProps} />);

      expect(container.querySelector('.total-score-container')).toBeInTheDocument();
    });

    it('should render total score label', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      expect(screen.getByText('Total Score')).toBeInTheDocument();
    });

    it('should render rounds breakdown section', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      expect(screen.getByText('Round Breakdown')).toBeInTheDocument();
    });
  });

  describe('performance rating', () => {
    it('should show Perfect rating for 95%+ score', () => {
      const rounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 4800, locationScore: 4800 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={rounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Perfect!')).toBeInTheDocument();
      expect(screen.getByText('🏆')).toBeInTheDocument();
    });

    it('should show Excellent rating for 80-94% score', () => {
      const rounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 4200, locationScore: 4200 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={rounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Excellent!')).toBeInTheDocument();
      expect(screen.getByText('🌟')).toBeInTheDocument();
    });

    it('should show Great rating for 60-79% score', () => {
      const rounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 3500, locationScore: 3500 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={rounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Great!')).toBeInTheDocument();
      expect(screen.getByText('👏')).toBeInTheDocument();
    });

    it('should show Good rating for 40-59% score', () => {
      const rounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 2500, locationScore: 2500 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={rounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Good')).toBeInTheDocument();
      expect(screen.getByText('👍')).toBeInTheDocument();
    });

    it('should show Keep Practicing rating for 20-39% score', () => {
      const rounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 1500, locationScore: 1500 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={rounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Keep Practicing')).toBeInTheDocument();
      expect(screen.getByText('📍')).toBeInTheDocument();
    });

    it('should show Beginner rating for <20% score', () => {
      const rounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 500, locationScore: 500 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={rounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Beginner')).toBeInTheDocument();
      expect(screen.getByText('🎯')).toBeInTheDocument();
    });
  });

  describe('score calculation', () => {
    it('should calculate total score correctly', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Total: 5000 + 4000 + 3000 + 4500 + 3500 = 20000
      expect(screen.getByText('20,000')).toBeInTheDocument();
    });

    it('should display max possible score', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      // 5 rounds * 5000 = 25000
      expect(screen.getByText('/ 25,000 points')).toBeInTheDocument();
    });

    it('should handle different number of rounds', () => {
      const threeRounds = [
        createMockRound({ roundNumber: 1, score: 5000 }),
        createMockRound({ roundNumber: 2, score: 5000 }),
        createMockRound({ roundNumber: 3, score: 5000 })
      ];

      render(<FinalResultsScreen {...defaultProps} rounds={threeRounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('15,000')).toBeInTheDocument();
      expect(screen.getByText('/ 15,000 points')).toBeInTheDocument();
    });
  });

  describe('round breakdown', () => {
    it('should display all rounds', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      expect(screen.getByText('Round 1')).toBeInTheDocument();
      expect(screen.getByText('Round 2')).toBeInTheDocument();
      expect(screen.getByText('Round 3')).toBeInTheDocument();
      expect(screen.getByText('Round 4')).toBeInTheDocument();
      expect(screen.getByText('Round 5')).toBeInTheDocument();
    });

    it('should display round images', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      const images = screen.getAllByRole('img', { name: /Round \d/ });
      expect(images).toHaveLength(5);
    });

    it('should display location score for each round', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      const locationLabels = screen.getAllByText('Location');
      expect(locationLabels).toHaveLength(5);
    });

    it('should display floor status for each round', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      const floorLabels = screen.getAllByText('Floor');
      expect(floorLabels).toHaveLength(5);
    });

    it('should show checkmark for correct floor', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks.length).toBeGreaterThan(0);
    });

    it('should show penalty indicator for wrong floor', () => {
      const roundsWithWrongFloor = [
        createMockRound({ roundNumber: 1, score: 4000, locationScore: 5000, floorCorrect: false })
      ];

      render(<FinalResultsScreen {...defaultProps} rounds={roundsWithWrongFloor} />);

      expect(screen.getByText('-20%')).toBeInTheDocument();
    });

    it('should display individual round scores', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      // Multiple elements may have these values, so use getAllByText
      expect(screen.getAllByText('5,000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('4,000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3,000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('4,500').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3,500').length).toBeGreaterThan(0);
    });
  });

  describe('action buttons', () => {
    it('should render Play Again button', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      expect(screen.getByText('Play Again')).toBeInTheDocument();
    });

    it('should render Back to Home button', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      expect(screen.getByText('Back to Home')).toBeInTheDocument();
    });

    it('should call onPlayAgain when Play Again clicked', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onPlayAgain = vi.fn();

      render(<FinalResultsScreen {...defaultProps} onPlayAgain={onPlayAgain} />);

      await user.click(screen.getByText('Play Again'));

      expect(onPlayAgain).toHaveBeenCalledTimes(1);
    });

    it('should call onBackToTitle when Back to Home clicked', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onBackToTitle = vi.fn();

      render(<FinalResultsScreen {...defaultProps} onBackToTitle={onBackToTitle} />);

      await user.click(screen.getByText('Back to Home'));

      expect(onBackToTitle).toHaveBeenCalledTimes(1);
    });

    it('should render button icons', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      expect(screen.getByText('🔄')).toBeInTheDocument();
      expect(screen.getByText('🏠')).toBeInTheDocument();
    });
  });

  describe('confetti', () => {
    it('should show confetti for high scores after animation', () => {
      const perfectRounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 5000, locationScore: 5000 })
      );

      const { container } = render(<FinalResultsScreen {...defaultProps} rounds={perfectRounds} />);

      // Animation complete + delay
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const confetti = container.querySelectorAll('.confetti');
      expect(confetti.length).toBeGreaterThan(0);
    });

    it('should not show confetti for low scores', () => {
      const lowRounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 500, locationScore: 500 })
      );

      const { container } = render(<FinalResultsScreen {...defaultProps} rounds={lowRounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const confetti = container.querySelectorAll('.confetti');
      expect(confetti.length).toBe(0);
    });

    it('should generate exactly 30 confetti pieces', () => {
      const perfectRounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 5000, locationScore: 5000 })
      );

      const { container } = render(<FinalResultsScreen {...defaultProps} rounds={perfectRounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const confetti = container.querySelectorAll('.confetti');
      expect(confetti.length).toBe(30);
    });
  });

  describe('score animation', () => {
    it('should animate score from 0', () => {
      const { container } = render(<FinalResultsScreen {...defaultProps} />);

      // Initially should show 0 or animating value
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // The total score value element should exist
      const totalValue = container.querySelector('.total-value');
      expect(totalValue).toBeInTheDocument();
    });

    it('should reach final score after animation', () => {
      render(<FinalResultsScreen {...defaultProps} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('20,000')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty rounds array', () => {
      render(<FinalResultsScreen {...defaultProps} rounds={[]} />);

      expect(screen.getByText('Game Complete!')).toBeInTheDocument();
      expect(screen.getByText('/ 0 points')).toBeInTheDocument();
    });

    it('should handle single round', () => {
      const singleRound = [createMockRound({ roundNumber: 1, score: 5000 })];

      render(<FinalResultsScreen {...defaultProps} rounds={singleRound} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Multiple elements may have 5,000
      expect(screen.getAllByText('5,000').length).toBeGreaterThan(0);
      expect(screen.getByText('/ 5,000 points')).toBeInTheDocument();
    });

    it('should handle all perfect scores', () => {
      const perfectRounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 5000, locationScore: 5000 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={perfectRounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('25,000')).toBeInTheDocument();
      expect(screen.getByText('Perfect!')).toBeInTheDocument();
    });

    it('should handle all zero scores', () => {
      const zeroRounds = Array(5).fill(null).map((_, i) =>
        createMockRound({ roundNumber: i + 1, score: 0, locationScore: 0 })
      );

      render(<FinalResultsScreen {...defaultProps} rounds={zeroRounds} />);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Beginner')).toBeInTheDocument();
    });
  });
});
