import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TitleScreen from './TitleScreen';

// Mock Firebase
vi.mock('../../firebase', () => ({
  db: {},
  app: {},
  auth: {}
}));

// Mock AuthContext so TitleScreen's useAuth() works
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'test-uid', email: 'test@example.com' },
    userDoc: { uid: 'test-uid', username: 'TestUser', email: 'test@example.com' },
    loading: false,
    needsUsername: false,
    logout: vi.fn(),
    updateUsername: vi.fn(),
    levelInfo: {
      level: 1,
      currentLevelXp: 10000,
      xpIntoLevel: 0,
      xpToNextLevel: 10000,
      progress: 0
    },
    levelTitle: 'Newcomer',
  }),
}));

describe('TitleScreen', () => {
  const defaultProps = {
    onPlay: vi.fn(),
    onOpenSubmission: vi.fn(),
    onOpenProfile: vi.fn(),
    onOpenFriends: vi.fn(),
    onOpenLeaderboard: vi.fn(),
    onOpenBugReport: vi.fn(),
    onOpenDailyGoals: vi.fn(),
    isLoading: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the game title', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByText('HW Geoguessr')).toBeInTheDocument();
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

      expect(screen.getByText('\uD83C\uDF0D')).toBeInTheDocument();
    });

    it('should render the Play button', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    });

    it('should render the Submit Photo button', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /submit photo/i })).toBeInTheDocument();
    });

    it('should render the Report Bug button', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /report bug/i })).toBeInTheDocument();
    });
  });

  describe('Play button', () => {
    it('should call onPlay when clicked', async () => {
      const user = userEvent.setup();
      const onPlay = vi.fn();

      render(<TitleScreen {...defaultProps} onPlay={onPlay} />);

      await user.click(screen.getByRole('button', { name: /^play$/i }));

      expect(onPlay).toHaveBeenCalledTimes(1);
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

      expect(screen.getByRole('button', { name: /^play$/i })).not.toBeDisabled();
    });

    it('should not call onPlay when disabled', async () => {
      const user = userEvent.setup();
      const onPlay = vi.fn();

      render(<TitleScreen {...defaultProps} onPlay={onPlay} isLoading={true} />);

      const button = screen.getByRole('button', { name: /loading/i });
      await user.click(button);

      expect(onPlay).not.toHaveBeenCalled();
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

  describe('Report Bug button', () => {
    it('should call onOpenBugReport when clicked', async () => {
      const user = userEvent.setup();
      const onOpenBugReport = vi.fn();

      render(<TitleScreen {...defaultProps} onOpenBugReport={onOpenBugReport} />);

      await user.click(screen.getByRole('button', { name: /report bug/i }));

      expect(onOpenBugReport).toHaveBeenCalledTimes(1);
    });
  });

  describe('profile navigation', () => {
    it('should call onOpenProfile when the username is clicked', async () => {
      const user = userEvent.setup();
      const onOpenProfile = vi.fn();

      render(<TitleScreen {...defaultProps} onOpenProfile={onOpenProfile} />);

      await user.click(screen.getByRole('button', { name: 'TestUser' }));

      expect(onOpenProfile).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('should have accessible button names', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit photo/i })).toBeInTheDocument();
    });

    it('should have a main heading', () => {
      render(<TitleScreen {...defaultProps} />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HW Geoguessr');
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
