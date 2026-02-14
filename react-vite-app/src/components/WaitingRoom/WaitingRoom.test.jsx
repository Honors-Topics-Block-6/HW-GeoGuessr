import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mock dependencies ───────────────────────────────────────────────
vi.mock('../../services/duelService', () => ({
  startDuel: vi.fn()
}));

vi.mock('./WaitingRoom.css', () => ({}));

const mockUseWaitingRoom = {
  lobby: null,
  isLoading: false,
  error: null,
  leave: vi.fn()
};

vi.mock('../../hooks/useLobby', () => ({
  useWaitingRoom: () => mockUseWaitingRoom
}));

import WaitingRoom from './WaitingRoom';

describe('WaitingRoom', () => {
  const defaultProps = {
    lobbyDocId: 'lobby-doc-1',
    userUid: 'user-1',
    onLeave: vi.fn(),
    onGameStart: vi.fn()
  };

  const baseLobby = {
    gameId: 'ABC123',
    hostUid: 'user-1',
    hostUsername: 'TestUser',
    difficulty: 'easy',
    maxPlayers: 2,
    status: 'waiting',
    players: [
      { uid: 'user-1', username: 'TestUser', joinedAt: '2024-01-01' }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWaitingRoom.lobby = null;
    mockUseWaitingRoom.isLoading = false;
    mockUseWaitingRoom.error = null;
  });

  describe('visibility badge', () => {
    it('should show public badge with icon for public lobbies', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'public' };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('🌐 Public')).toBeInTheDocument();
    });

    it('should show friends badge with icon for friends lobbies', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'friends' };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('👥 Friends')).toBeInTheDocument();
    });

    it('should show private badge with icon for private lobbies', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'private' };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('🔒 Private')).toBeInTheDocument();
    });

    it('should apply the correct CSS class for public visibility', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'public' };

      render(<WaitingRoom {...defaultProps} />);

      const badge = screen.getByText('🌐 Public');
      expect(badge.className).toContain('waiting-badge-vis');
      expect(badge.className).toContain('public');
    });

    it('should apply the correct CSS class for friends visibility', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'friends' };

      render(<WaitingRoom {...defaultProps} />);

      const badge = screen.getByText('👥 Friends');
      expect(badge.className).toContain('waiting-badge-vis');
      expect(badge.className).toContain('friends');
    });

    it('should apply the correct CSS class for private visibility', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'private' };

      render(<WaitingRoom {...defaultProps} />);

      const badge = screen.getByText('🔒 Private');
      expect(badge.className).toContain('waiting-badge-vis');
      expect(badge.className).toContain('private');
    });

    it('should not show multiple visibility badges simultaneously', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'friends' };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('👥 Friends')).toBeInTheDocument();
      expect(screen.queryByText('🌐 Public')).not.toBeInTheDocument();
      expect(screen.queryByText('🔒 Private')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when loading', () => {
      mockUseWaitingRoom.isLoading = true;

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('Loading lobby...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when there is an error', () => {
      mockUseWaitingRoom.error = 'This lobby no longer exists.';

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('This lobby no longer exists.')).toBeInTheDocument();
    });

    it('should show fallback error when lobby is null and no error', () => {
      mockUseWaitingRoom.lobby = null;
      mockUseWaitingRoom.error = null;

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('This lobby no longer exists.')).toBeInTheDocument();
    });
  });

  describe('game code display', () => {
    it('should display the game code', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'friends' };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });
  });

  describe('player list', () => {
    it('should display the host player', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'friends' };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('TestUser')).toBeInTheDocument();
    });

    it('should show waiting for opponent when lobby is not full', () => {
      mockUseWaitingRoom.lobby = { ...baseLobby, visibility: 'friends' };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('Waiting for opponent')).toBeInTheDocument();
    });

    it('should show both players ready when lobby is full and user is host', () => {
      mockUseWaitingRoom.lobby = {
        ...baseLobby,
        visibility: 'friends',
        players: [
          { uid: 'user-1', username: 'TestUser' },
          { uid: 'user-2', username: 'FriendUser' }
        ]
      };

      render(<WaitingRoom {...defaultProps} />);

      expect(screen.getByText('Both players ready!')).toBeInTheDocument();
    });
  });
});
