import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mock modules before importing the hook ──────────────────────────
vi.mock('../firebase', () => ({ db: {} }));

const mockSubscribePublicLobbies = vi.fn();
const mockSubscribeFriendsLobbies = vi.fn();
const mockCreateLobby = vi.fn();
const mockFindLobbyByGameId = vi.fn();
const mockJoinLobby = vi.fn();
const mockLeaveLobby = vi.fn();
const mockSubscribeLobby = vi.fn();
const mockSendHeartbeat = vi.fn();
const mockRemoveStale = vi.fn();

vi.mock('../services/lobbyService', () => ({
  createLobby: (...args) => mockCreateLobby(...args),
  findLobbyByGameId: (...args) => mockFindLobbyByGameId(...args),
  joinLobby: (...args) => mockJoinLobby(...args),
  leaveLobby: (...args) => mockLeaveLobby(...args),
  subscribeLobby: (...args) => mockSubscribeLobby(...args),
  subscribePublicLobbies: (...args) => mockSubscribePublicLobbies(...args),
  sendHeartbeat: (...args) => mockSendHeartbeat(...args),
  removeStalePlayersFromLobby: (...args) => mockRemoveStale(...args)
}));

vi.mock('../services/friendsLobbyService', () => ({
  subscribeFriendsLobbies: (...args) => mockSubscribeFriendsLobbies(...args)
}));

const mockSubscribeFriendsList = vi.fn();

vi.mock('../services/friendService', () => ({
  subscribeFriendsList: (...args) => mockSubscribeFriendsList(...args)
}));

import { useLobby } from './useLobby';

describe('useLobby', () => {
  let publicLobbiesCallback;
  let friendsLobbiesCallback;
  let friendsListCallback;
  const publicUnsub = vi.fn();
  const friendsLobbiesUnsub = vi.fn();
  const friendsListUnsub = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    publicLobbiesCallback = null;
    friendsLobbiesCallback = null;
    friendsListCallback = null;

    mockSubscribePublicLobbies.mockImplementation((cb) => {
      publicLobbiesCallback = cb;
      return publicUnsub;
    });

    mockSubscribeFriendsLobbies.mockImplementation((cb) => {
      friendsLobbiesCallback = cb;
      return friendsLobbiesUnsub;
    });

    mockSubscribeFriendsList.mockImplementation((_uid, cb) => {
      friendsListCallback = cb;
      return friendsListUnsub;
    });
  });

  it('should subscribe to public lobbies on mount', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    expect(mockSubscribePublicLobbies).toHaveBeenCalledTimes(1);
  });

  it('should subscribe to friends lobbies on mount', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    expect(mockSubscribeFriendsLobbies).toHaveBeenCalledTimes(1);
  });

  it('should subscribe to friends list when userUid is provided', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    expect(mockSubscribeFriendsList).toHaveBeenCalledTimes(1);
    expect(mockSubscribeFriendsList.mock.calls[0][0]).toBe('user-1');
  });

  it('should NOT subscribe to friends list when userUid is falsy', () => {
    renderHook(() => useLobby(null, 'TestUser', 'easy'));

    expect(mockSubscribeFriendsList).not.toHaveBeenCalled();
  });

  it('should return public lobbies from subscription', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    act(() => {
      publicLobbiesCallback([
        { docId: 'pub-1', hostUsername: 'Alice', visibility: 'public' },
        { docId: 'pub-2', hostUsername: 'Bob', visibility: 'public' }
      ]);
    });

    expect(result.current.publicLobbies).toHaveLength(2);
    expect(result.current.publicLobbies[0].docId).toBe('pub-1');
  });

  it('should filter friends lobbies to only show those hosted by actual friends', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // First, set up the friends list
    act(() => {
      friendsListCallback([
        { friendUid: 'friend-A', friendUsername: 'FriendA' },
        { friendUid: 'friend-B', friendUsername: 'FriendB' }
      ]);
    });

    // Then, simulate friends lobbies arriving
    act(() => {
      friendsLobbiesCallback([
        { docId: 'fl-1', hostUid: 'friend-A', visibility: 'friends' },
        { docId: 'fl-2', hostUid: 'stranger', visibility: 'friends' },
        { docId: 'fl-3', hostUid: 'friend-B', visibility: 'friends' }
      ]);
    });

    // Only friend-A and friend-B lobbies should appear
    expect(result.current.friendsLobbies).toHaveLength(2);
    expect(result.current.friendsLobbies[0].docId).toBe('fl-1');
    expect(result.current.friendsLobbies[1].docId).toBe('fl-3');
  });

  it('should return empty friendsLobbies when user has no friends', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // Friends list is empty
    act(() => {
      friendsListCallback([]);
    });

    // Friends lobbies exist but none from friends
    act(() => {
      friendsLobbiesCallback([
        { docId: 'fl-1', hostUid: 'stranger-1', visibility: 'friends' }
      ]);
    });

    expect(result.current.friendsLobbies).toHaveLength(0);
  });

  it('should re-filter friends lobbies when friends list updates', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // Initial friends lobbies with no friends list yet -> should be empty
    act(() => {
      friendsLobbiesCallback([
        { docId: 'fl-1', hostUid: 'friend-A', visibility: 'friends' }
      ]);
    });
    expect(result.current.friendsLobbies).toHaveLength(0);

    // Now friends list arrives -> should re-filter and show the lobby
    act(() => {
      friendsListCallback([
        { friendUid: 'friend-A', friendUsername: 'FriendA' }
      ]);
    });
    expect(result.current.friendsLobbies).toHaveLength(1);
    expect(result.current.friendsLobbies[0].docId).toBe('fl-1');
  });

  it('should remove a lobby from friendsLobbies when friend is removed', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // Set up friends and lobbies
    act(() => {
      friendsListCallback([
        { friendUid: 'friend-A', friendUsername: 'FriendA' },
        { friendUid: 'friend-B', friendUsername: 'FriendB' }
      ]);
    });
    act(() => {
      friendsLobbiesCallback([
        { docId: 'fl-1', hostUid: 'friend-A', visibility: 'friends' },
        { docId: 'fl-2', hostUid: 'friend-B', visibility: 'friends' }
      ]);
    });
    expect(result.current.friendsLobbies).toHaveLength(2);

    // friend-B is removed from friends list
    act(() => {
      friendsListCallback([
        { friendUid: 'friend-A', friendUsername: 'FriendA' }
      ]);
    });
    expect(result.current.friendsLobbies).toHaveLength(1);
    expect(result.current.friendsLobbies[0].hostUid).toBe('friend-A');
  });

  it('should NOT tear down friends lobbies listener when friends list changes', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // subscribeFriendsLobbies should be called exactly once on mount
    expect(mockSubscribeFriendsLobbies).toHaveBeenCalledTimes(1);

    // Simulate friends list changing multiple times
    act(() => {
      friendsListCallback([{ friendUid: 'a', friendUsername: 'A' }]);
    });
    act(() => {
      friendsListCallback([{ friendUid: 'a', friendUsername: 'A' }, { friendUid: 'b', friendUsername: 'B' }]);
    });
    act(() => {
      friendsListCallback([]);
    });

    // Still only called once — no thrashing
    expect(mockSubscribeFriendsLobbies).toHaveBeenCalledTimes(1);
    expect(friendsLobbiesUnsub).not.toHaveBeenCalled();
  });

  it('should unsubscribe all listeners on unmount', () => {
    const { unmount } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    unmount();

    expect(publicUnsub).toHaveBeenCalledTimes(1);
    expect(friendsLobbiesUnsub).toHaveBeenCalledTimes(1);
    expect(friendsListUnsub).toHaveBeenCalledTimes(1);
  });

  describe('hostGame', () => {
    it('should create a lobby with the specified visibility', async () => {
      mockCreateLobby.mockResolvedValueOnce({ docId: 'new-lobby', gameId: 'ABC123' });

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      let hostResult;
      await act(async () => {
        hostResult = await result.current.hostGame('friends');
      });

      expect(mockCreateLobby).toHaveBeenCalledWith('user-1', 'TestUser', 'easy', 'friends');
      expect(hostResult).toEqual({ docId: 'new-lobby', gameId: 'ABC123' });
    });

    it('should create a lobby with public visibility', async () => {
      mockCreateLobby.mockResolvedValueOnce({ docId: 'pub-lobby', gameId: 'DEF456' });

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'hard'));

      await act(async () => {
        await result.current.hostGame('public');
      });

      expect(mockCreateLobby).toHaveBeenCalledWith('user-1', 'TestUser', 'hard', 'public');
    });

    it('should set error on failure and return null', async () => {
      mockCreateLobby.mockRejectedValueOnce(new Error('Firestore error'));

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      let hostResult;
      await act(async () => {
        hostResult = await result.current.hostGame('friends');
      });

      expect(hostResult).toBeNull();
      expect(result.current.error).toBe('Failed to create game. Please try again.');
    });

    it('should manage isCreating state during host flow', async () => {
      let resolveCreate;
      mockCreateLobby.mockImplementationOnce(() => new Promise(r => { resolveCreate = r; }));

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      expect(result.current.isCreating).toBe(false);

      let hostPromise;
      act(() => {
        hostPromise = result.current.hostGame('friends');
      });

      expect(result.current.isCreating).toBe(true);

      await act(async () => {
        resolveCreate({ docId: 'lobby', gameId: 'XYZ' });
        await hostPromise;
      });

      expect(result.current.isCreating).toBe(false);
    });
  });

  describe('joinByCode', () => {
    it('should find and join a lobby by code', async () => {
      mockFindLobbyByGameId.mockResolvedValueOnce({ docId: 'found-lobby' });
      mockJoinLobby.mockResolvedValueOnce();

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      let joinResult;
      await act(async () => {
        joinResult = await result.current.joinByCode('ABC123');
      });

      expect(joinResult).toEqual({ docId: 'found-lobby' });
      expect(mockJoinLobby).toHaveBeenCalledWith('found-lobby', 'user-1', 'TestUser', 'easy');
    });

    it('should set error if no lobby found with code', async () => {
      mockFindLobbyByGameId.mockResolvedValueOnce(null);

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      let joinResult;
      await act(async () => {
        joinResult = await result.current.joinByCode('XXXXXX');
      });

      expect(joinResult).toBeNull();
      expect(result.current.error).toBe('No active game found with that code.');
    });

    it('should surface friends-only error when non-friend tries to join via code', async () => {
      mockFindLobbyByGameId.mockResolvedValueOnce({ docId: 'friends-lobby' });
      mockJoinLobby.mockRejectedValueOnce(
        new Error('This lobby is friends-only. You must be friends with the host to join.')
      );

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      let joinResult;
      await act(async () => {
        joinResult = await result.current.joinByCode('FRN123');
      });

      expect(joinResult).toBeNull();
      expect(result.current.error).toContain('friends-only');
    });
  });

  describe('clearError', () => {
    it('should clear the error state', async () => {
      mockCreateLobby.mockRejectedValueOnce(new Error('fail'));

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      await act(async () => {
        await result.current.hostGame('public');
      });
      expect(result.current.error).toBeTruthy();

      act(() => {
        result.current.clearError();
      });
      expect(result.current.error).toBeNull();
    });
  });
});
