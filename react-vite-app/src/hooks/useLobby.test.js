import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Integration test: only mock the Firestore boundary ────────────
// We do NOT mock lobbyService, friendsLobbyService, or friendService.
// Instead we mock firebase/firestore and ../firebase so the REAL service
// code runs, and we can catch bugs in how the services construct queries,
// handle snapshots, etc.

vi.mock('../firebase', () => ({
  db: { _marker: 'mock-db' }
}));

// Capture snapshot callbacks registered by the real onSnapshot calls
// so we can simulate Firestore events
let onSnapshotCalls = [];
const mockOnSnapshotUnsub = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id, path: `lobbies/${id}` })),
  collection: vi.fn((_db, name) => ({ _collectionName: name })),
  query: vi.fn((...args) => ({ _queryArgs: args })),
  where: vi.fn((field, op, val) => ({ _type: 'where', field, op, val })),
  orderBy: vi.fn((...args) => args),
  onSnapshot: vi.fn((q, successCb, errorCb) => {
    onSnapshotCalls.push({ query: q, successCb, errorCb });
    return mockOnSnapshotUnsub;
  }),
  arrayUnion: vi.fn(val => val),
  arrayRemove: vi.fn(val => val),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp: { now: vi.fn(() => ({ toMillis: () => Date.now() })) }
}));

// subscribeFriendsList is used directly in the hook — we mock only this
// since it queries a different collection (friends, not lobbies)
const mockSubscribeFriendsList = vi.fn();
vi.mock('../services/friendService', () => ({
  subscribeFriendsList: (...args) => mockSubscribeFriendsList(...args),
  areFriends: vi.fn()
}));

import { addDoc, onSnapshot } from 'firebase/firestore';
import { useLobby } from './useLobby';

describe('useLobby (integration)', () => {
  let friendsListCallback;
  const friendsListUnsub = vi.fn();

  /**
   * Helper: find the onSnapshot call whose query filters on a specific
   * visibility value. This lets us target the public vs friends listener.
   */
  function findSnapshotCall(visibility) {
    return onSnapshotCalls.find(call => {
      const args = call.query?._queryArgs || [];
      return args.some(a => a._type === 'where' && a.field === 'visibility' && a.val === visibility);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshotCalls = [];
    friendsListCallback = null;

    mockSubscribeFriendsList.mockImplementation((_uid, cb) => {
      friendsListCallback = cb;
      return friendsListUnsub;
    });
  });

  it('should set up real onSnapshot listeners for public and friends lobbies', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // The real subscribePublicLobbies and subscribeFriendsLobbies run,
    // each calling onSnapshot once
    expect(onSnapshot).toHaveBeenCalledTimes(2);

    // Verify the queries target the right visibility values
    const publicCall = findSnapshotCall('public');
    const friendsCall = findSnapshotCall('friends');

    expect(publicCall).toBeDefined();
    expect(friendsCall).toBeDefined();
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

  it('should return public lobbies from the real subscribePublicLobbies listener', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const publicCall = findSnapshotCall('public');

    act(() => {
      publicCall.successCb({
        docs: [
          { id: 'pub-1', data: () => ({ hostUsername: 'Alice', visibility: 'public' }) },
          { id: 'pub-2', data: () => ({ hostUsername: 'Bob', visibility: 'public' }) }
        ]
      });
    });

    expect(result.current.publicLobbies).toHaveLength(2);
    expect(result.current.publicLobbies[0].docId).toBe('pub-1');
    expect(result.current.publicLobbies[1].docId).toBe('pub-2');
  });

  it('should filter friends lobbies to only show those hosted by actual friends', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const friendsCall = findSnapshotCall('friends');

    // First, set up the friends list
    act(() => {
      friendsListCallback([
        { friendUid: 'friend-A', friendUsername: 'FriendA' },
        { friendUid: 'friend-B', friendUsername: 'FriendB' }
      ]);
    });

    // Then, simulate friends lobbies arriving via the REAL listener
    act(() => {
      friendsCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'friend-A', visibility: 'friends' }) },
          { id: 'fl-2', data: () => ({ hostUid: 'stranger', visibility: 'friends' }) },
          { id: 'fl-3', data: () => ({ hostUid: 'friend-B', visibility: 'friends' }) }
        ]
      });
    });

    // Only friend-A and friend-B lobbies should appear
    expect(result.current.friendsLobbies).toHaveLength(2);
    expect(result.current.friendsLobbies[0].docId).toBe('fl-1');
    expect(result.current.friendsLobbies[1].docId).toBe('fl-3');
  });

  it('should return empty friendsLobbies when user has no friends', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const friendsCall = findSnapshotCall('friends');

    act(() => {
      friendsListCallback([]);
    });

    act(() => {
      friendsCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'stranger-1', visibility: 'friends' }) }
        ]
      });
    });

    expect(result.current.friendsLobbies).toHaveLength(0);
  });

  it('should re-filter friends lobbies when friends list updates', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const friendsCall = findSnapshotCall('friends');

    // Friends lobbies arrive before friends list -> should be empty
    act(() => {
      friendsCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'friend-A', visibility: 'friends' }) }
        ]
      });
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

    const friendsCall = findSnapshotCall('friends');

    act(() => {
      friendsListCallback([
        { friendUid: 'friend-A', friendUsername: 'FriendA' },
        { friendUid: 'friend-B', friendUsername: 'FriendB' }
      ]);
    });
    act(() => {
      friendsCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'friend-A', visibility: 'friends' }) },
          { id: 'fl-2', data: () => ({ hostUid: 'friend-B', visibility: 'friends' }) }
        ]
      });
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

    // onSnapshot called exactly twice (public + friends), once each
    const initialCallCount = onSnapshot.mock.calls.length;
    expect(initialCallCount).toBe(2);

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

    // No new onSnapshot calls — no listener thrashing
    expect(onSnapshot.mock.calls.length).toBe(initialCallCount);
  });

  it('should unsubscribe all listeners on unmount', () => {
    const { unmount } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    unmount();

    // 2 onSnapshot unsubs (public + friends) + 1 friendsList unsub
    expect(mockOnSnapshotUnsub).toHaveBeenCalledTimes(2);
    expect(friendsListUnsub).toHaveBeenCalledTimes(1);
  });

  describe('resilience — hostGame must work even when friends features fail', () => {
    it('should still create a game when subscribeFriendsLobbies onSnapshot errors immediately', async () => {
      // Simulate: friends lobby index missing, onSnapshot fires error
      // This MUST NOT break createLobby
      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      const friendsCall = findSnapshotCall('friends');
      // Simulate the onSnapshot error handler firing (missing index)
      act(() => {
        friendsCall.errorCb(new Error('Missing composite index for friends'));
      });

      addDoc.mockResolvedValueOnce({ id: 'new-lobby' });

      let hostResult;
      await act(async () => {
        hostResult = await result.current.hostGame('public');
      });

      expect(hostResult).not.toBeNull();
      expect(hostResult.docId).toBe('new-lobby');
    });

    it('should still create a game when subscribeFriendsList throws', async () => {
      // Simulate: friendService completely broken
      mockSubscribeFriendsList.mockImplementation(() => {
        throw new Error('friendService module failed to load');
      });

      // This will cause the useEffect to throw — does it kill the hook?
      let hookError = null;
      try {
        const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

        addDoc.mockResolvedValueOnce({ id: 'new-lobby' });

        let hostResult;
        await act(async () => {
          hostResult = await result.current.hostGame('public');
        });

        // If we get here, hostGame worked despite friendService being broken
        expect(hostResult).not.toBeNull();
        expect(hostResult.docId).toBe('new-lobby');
      } catch (e) {
        hookError = e;
      }

      // If this fails, it proves that a broken friendService crashes the
      // entire useLobby hook, preventing game creation
      if (hookError) {
        // This is the BUG: friendService failure kills createLobby
        expect.fail(
          `friendService failure crashed the hook, preventing game creation: ${hookError.message}`
        );
      }
    });

    it('should still create a game when subscribeFriendsLobbies throws synchronously', async () => {
      // Override onSnapshot to throw for the friends query
      const originalImpl = onSnapshot.getMockImplementation();
      let callCount = 0;
      onSnapshot.mockImplementation((q, successCb, errorCb) => {
        callCount++;
        const args = q?._queryArgs || [];
        const isFriendsQuery = args.some(
          a => a._type === 'where' && a.field === 'visibility' && a.val === 'friends'
        );
        if (isFriendsQuery) {
          throw new Error('Firestore not initialized');
        }
        onSnapshotCalls.push({ query: q, successCb, errorCb });
        return mockOnSnapshotUnsub;
      });

      let hookError = null;
      try {
        const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

        addDoc.mockResolvedValueOnce({ id: 'new-lobby' });

        let hostResult;
        await act(async () => {
          hostResult = await result.current.hostGame('public');
        });

        expect(hostResult).not.toBeNull();
        expect(hostResult.docId).toBe('new-lobby');
      } catch (e) {
        hookError = e;
      }

      // Restore
      onSnapshot.mockImplementation((q, successCb, errorCb) => {
        onSnapshotCalls.push({ query: q, successCb, errorCb });
        return mockOnSnapshotUnsub;
      });

      if (hookError) {
        expect.fail(
          `subscribeFriendsLobbies throwing crashed the hook, preventing game creation: ${hookError.message}`
        );
      }
    });
  });

  describe('hostGame', () => {
    it('should call the real createLobby which calls addDoc with correct data', async () => {
      addDoc.mockResolvedValueOnce({ id: 'new-lobby' });

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      let hostResult;
      await act(async () => {
        hostResult = await result.current.hostGame('friends');
      });

      expect(hostResult.docId).toBe('new-lobby');
      expect(hostResult.gameId).toHaveLength(6);

      // Verify the REAL createLobby wrote the right data
      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.visibility).toBe('friends');
      expect(lobbyData.hostUid).toBe('user-1');
      expect(lobbyData.hostUsername).toBe('TestUser');
      expect(lobbyData.difficulty).toBe('easy');
      expect(lobbyData.status).toBe('waiting');
    });

    it('should write public visibility when public is selected', async () => {
      addDoc.mockResolvedValueOnce({ id: 'pub-lobby' });

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'hard'));

      await act(async () => {
        await result.current.hostGame('public');
      });

      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.visibility).toBe('public');
      expect(lobbyData.difficulty).toBe('hard');
    });

    it('should write private visibility when private is selected', async () => {
      addDoc.mockResolvedValueOnce({ id: 'priv-lobby' });

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'medium'));

      await act(async () => {
        await result.current.hostGame('private');
      });

      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.visibility).toBe('private');
    });

    it('should set error on failure and return null', async () => {
      addDoc.mockRejectedValueOnce(new Error('Firestore error'));

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      let hostResult;
      await act(async () => {
        hostResult = await result.current.hostGame('friends');
      });

      expect(hostResult).toBeNull();
      expect(result.current.error).toBe('Failed to create game. Please try again.');
    });

    it('should manage isCreating state during host flow', async () => {
      let resolveAddDoc;
      addDoc.mockImplementationOnce(() => new Promise(r => { resolveAddDoc = r; }));

      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      expect(result.current.isCreating).toBe(false);

      let hostPromise;
      act(() => {
        hostPromise = result.current.hostGame('friends');
      });

      expect(result.current.isCreating).toBe(true);

      await act(async () => {
        resolveAddDoc({ id: 'lobby' });
        await hostPromise;
      });

      expect(result.current.isCreating).toBe(false);
    });
  });

  describe('clearError', () => {
    it('should clear the error state', async () => {
      addDoc.mockRejectedValueOnce(new Error('fail'));

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
