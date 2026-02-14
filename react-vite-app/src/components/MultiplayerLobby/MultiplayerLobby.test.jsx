import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mock child components ───────────────────────────────────────────
vi.mock('./GameCodeInput', () => ({
  default: ({ onJoin, isJoining }) => (
    <div data-testid="game-code-input">
      <button onClick={() => onJoin('ABC123')} disabled={isJoining}>
        MockJoinByCode
      </button>
    </div>
  )
}));

vi.mock('./PublicGameList', () => ({
  default: ({ lobbies, onJoin, isJoining }) => (
    <div data-testid="public-game-list">
      <span data-testid="lobby-count">{lobbies.length}</span>
      {lobbies.map(l => (
        <button key={l.docId} onClick={() => onJoin(l.docId)} disabled={isJoining}>
          {l.hostUsername || l.docId}
        </button>
      ))}
    </div>
  )
}));

// ── Mock the hook ───────────────────────────────────────────────────
const mockUseLobby = {
  publicLobbies: [],
  friendsLobbies: [],
  isCreating: false,
  isJoining: false,
  error: null,
  hostGame: vi.fn(),
  joinByCode: vi.fn(),
  joinPublicGame: vi.fn(),
  clearError: vi.fn()
};

vi.mock('../../hooks/useLobby', () => ({
  useLobby: () => mockUseLobby
}));

vi.mock('./MultiplayerLobby.css', () => ({}));

import MultiplayerLobby from './MultiplayerLobby';

describe('MultiplayerLobby', () => {
  const defaultProps = {
    difficulty: 'easy',
    userUid: 'user-1',
    userUsername: 'TestUser',
    onJoinedLobby: vi.fn(),
    onBack: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLobby.publicLobbies = [];
    mockUseLobby.friendsLobbies = [];
    mockUseLobby.isCreating = false;
    mockUseLobby.isJoining = false;
    mockUseLobby.error = null;
  });

  describe('visibility toggle', () => {
    it('should render three visibility toggle buttons', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      expect(screen.getByText('Public')).toBeInTheDocument();
      expect(screen.getByText('Friends')).toBeInTheDocument();
      expect(screen.getByText('Private')).toBeInTheDocument();
    });

    it('should default to public visibility selected', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      const publicBtn = screen.getByText('Public').closest('button');
      const friendsBtn = screen.getByText('Friends').closest('button');
      const privateBtn = screen.getByText('Private').closest('button');

      expect(publicBtn.className).toContain('selected');
      expect(friendsBtn.className).not.toContain('selected');
      expect(privateBtn.className).not.toContain('selected');
    });

    it('should select Friends when clicked', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      const friendsBtn = screen.getByText('Friends').closest('button');
      fireEvent.click(friendsBtn);

      expect(friendsBtn.className).toContain('selected');

      const publicBtn = screen.getByText('Public').closest('button');
      const privateBtn = screen.getByText('Private').closest('button');
      expect(publicBtn.className).not.toContain('selected');
      expect(privateBtn.className).not.toContain('selected');
    });

    it('should select Private when clicked', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      const privateBtn = screen.getByText('Private').closest('button');
      fireEvent.click(privateBtn);

      expect(privateBtn.className).toContain('selected');

      const publicBtn = screen.getByText('Public').closest('button');
      expect(publicBtn.className).not.toContain('selected');
    });

    it('should switch back to Public from Friends', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      const friendsBtn = screen.getByText('Friends').closest('button');
      const publicBtn = screen.getByText('Public').closest('button');

      fireEvent.click(friendsBtn);
      expect(friendsBtn.className).toContain('selected');

      fireEvent.click(publicBtn);
      expect(publicBtn.className).toContain('selected');
      expect(friendsBtn.className).not.toContain('selected');
    });

    it('should display correct icons for each visibility', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      expect(screen.getByText('🌐')).toBeInTheDocument();
      expect(screen.getByText('👥')).toBeInTheDocument();
      expect(screen.getByText('🔒')).toBeInTheDocument();
    });
  });

  describe('hosting with visibility', () => {
    it('should host a game with friends visibility when Friends is selected', async () => {
      mockUseLobby.hostGame.mockResolvedValueOnce({ docId: 'new-lobby' });

      render(<MultiplayerLobby {...defaultProps} />);

      // Select Friends
      const friendsBtn = screen.getByText('Friends').closest('button');
      fireEvent.click(friendsBtn);

      // Click Create Game
      const createBtn = screen.getByText('Create Game');
      fireEvent.click(createBtn);

      expect(mockUseLobby.hostGame).toHaveBeenCalledWith('friends');
    });

    it('should host with public visibility by default', () => {
      mockUseLobby.hostGame.mockResolvedValueOnce({ docId: 'pub-lobby' });

      render(<MultiplayerLobby {...defaultProps} />);

      const createBtn = screen.getByText('Create Game');
      fireEvent.click(createBtn);

      expect(mockUseLobby.hostGame).toHaveBeenCalledWith('public');
    });

    it('should host with private visibility when Private is selected', () => {
      mockUseLobby.hostGame.mockResolvedValueOnce({ docId: 'priv-lobby' });

      render(<MultiplayerLobby {...defaultProps} />);

      const privateBtn = screen.getByText('Private').closest('button');
      fireEvent.click(privateBtn);

      const createBtn = screen.getByText('Create Game');
      fireEvent.click(createBtn);

      expect(mockUseLobby.hostGame).toHaveBeenCalledWith('private');
    });
  });

  describe('game sections', () => {
    it('should render Public Games section', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      expect(screen.getByText('Public Games')).toBeInTheDocument();
    });

    it('should render Friends\' Games section', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      expect(screen.getByText("Friends' Games")).toBeInTheDocument();
    });

    it('should render friends\' games description', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      expect(screen.getByText(/Games hosted by your friends/)).toBeInTheDocument();
    });

    it('should pass publicLobbies to the Public Games list', () => {
      mockUseLobby.publicLobbies = [
        { docId: 'pub-1', hostUsername: 'Alice', difficulty: 'easy' }
      ];

      render(<MultiplayerLobby {...defaultProps} />);

      const lists = screen.getAllByTestId('public-game-list');
      // First list is Public Games, second is Friends' Games
      const publicListLobbyCount = lists[0].querySelector('[data-testid="lobby-count"]');
      expect(publicListLobbyCount.textContent).toBe('1');
    });

    it('should pass friendsLobbies to the Friends\' Games list', () => {
      mockUseLobby.friendsLobbies = [
        { docId: 'fl-1', hostUsername: 'FriendA', difficulty: 'easy' },
        { docId: 'fl-2', hostUsername: 'FriendB', difficulty: 'easy' }
      ];

      render(<MultiplayerLobby {...defaultProps} />);

      const lists = screen.getAllByTestId('public-game-list');
      const friendsListLobbyCount = lists[1].querySelector('[data-testid="lobby-count"]');
      expect(friendsListLobbyCount.textContent).toBe('2');
    });

    it('should show empty state for Friends\' Games when no friends lobbies', () => {
      mockUseLobby.friendsLobbies = [];

      render(<MultiplayerLobby {...defaultProps} />);

      const lists = screen.getAllByTestId('public-game-list');
      const friendsListLobbyCount = lists[1].querySelector('[data-testid="lobby-count"]');
      expect(friendsListLobbyCount.textContent).toBe('0');
    });
  });

  describe('error display', () => {
    it('should display error message when error exists', () => {
      mockUseLobby.error = 'This lobby is friends-only. You must be friends with the host to join.';

      render(<MultiplayerLobby {...defaultProps} />);

      expect(screen.getByText(/friends-only/)).toBeInTheDocument();
    });

    it('should clear error on dismiss', () => {
      mockUseLobby.error = 'Some error';

      render(<MultiplayerLobby {...defaultProps} />);

      const dismissBtn = screen.getByText('×');
      fireEvent.click(dismissBtn);

      expect(mockUseLobby.clearError).toHaveBeenCalledTimes(1);
    });
  });

  describe('back button', () => {
    it('should call onBack when back button is clicked', () => {
      render(<MultiplayerLobby {...defaultProps} />);

      const backBtn = screen.getByText('← Back');
      fireEvent.click(backBtn);

      expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('difficulty badge', () => {
    it('should display the selected difficulty', () => {
      render(<MultiplayerLobby {...defaultProps} difficulty="hard" />);

      expect(screen.getByText('Hard Difficulty')).toBeInTheDocument();
    });
  });
});
