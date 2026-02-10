import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TitleScreen from './TitleScreen';

describe('TitleScreen', () => {
  const defaultProps = {
    onStartGame: vi.fn(),
    onOpenSubmission: vi.fn(),
    isLoading: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the game title', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByText('HW Geogessr')).toBeInTheDocument();
    });

    it('should render the tagline', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByText('Can you guess the location on campus?')).toBeInTheDocument();
    });

    it('should render the subtitle', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByText('Explore Harvard-Westlake through photos')).toBeInTheDocument();
    });

    it('should render the logo icon', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByText('🌍')).toBeInTheDocument();
    });

    it('should render the Start Game button', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
    });

    it('should render the Submit Photo button', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /submit photo/i })).toBeInTheDocument();
    });
  });

  describe('Start Game button', () => {
    it('should call onStartGame when clicked', async () => {
      const user = userEvent.setup();
      const onStartGame = vi.fn();

      render(<TitleScreen {...defaultProps} onStartGame={onStartGame} />);

      await user.click(screen.getByRole('button', { name: /start game/i }));

      expect(onStartGame).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when loading', () => {
      render(<TitleScreen {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
    });

    it('should show loading text when loading', () => {
      render(<TitleScreen {...defaultProps} isLoading={true} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should not be disabled when not loading', () => {
      render(<TitleScreen {...defaultProps} isLoading={false} />);

      expect(screen.getByRole('button', { name: /start game/i })).not.toBeDisabled();
    });

    it('should not call onStartGame when disabled', async () => {
      const user = userEvent.setup();
      const onStartGame = vi.fn();

      render(<TitleScreen {...defaultProps} onStartGame={onStartGame} isLoading={true} />);

      const button = screen.getByRole('button', { name: /loading/i });
      await user.click(button);

      expect(onStartGame).not.toHaveBeenCalled();
    });
  });

  describe('Submit Photo button', () => {
    it('should call onOpenSubmission when clicked', async () => {
      const user = userEvent.setup();
      const onOpenSubmission = vi.fn();

      render(<TitleScreen {...defaultProps} onOpenSubmission={onOpenSubmission} />);

      await user.click(screen.getByRole('button', { name: /submit photo/i }));

      expect(onOpenSubmission).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('should have accessible button names', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit photo/i })).toBeInTheDocument();
    });

    it('should have a main heading', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HW Geogessr');
    });
  });

  describe('loading state', () => {
    it('should show spinner element when loading', () => {
      const { container } = render(<TitleScreen {...defaultProps} isLoading={true} />);

      expect(container.querySelector('.button-spinner')).toBeInTheDocument();
    });

    it('should not show spinner when not loading', () => {
      const { container } = render(<TitleScreen {...defaultProps} isLoading={false} />);

      expect(container.querySelector('.button-spinner')).not.toBeInTheDocument();
    });
  });
});
