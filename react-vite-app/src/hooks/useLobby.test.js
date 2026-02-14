import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── TRUE integration test: only mock the Firestore boundary ─────
// We do NOT mock lobbyService, friendsLobbyService, OR friendService.
// Every service module runs its REAL code. Only firebase/firestore
// and ../firebase are faked so no network calls are made.

vi.mock('../firebase', () => ({
  db: { _marker: 'mock-db' }
}));

// Capture every onSnapshot registration so tests can simulate Firestore events
let onSnapshotCalls = [];
const mockOnSnapshotUnsub = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(() => ({ empty: true, docs: [] })),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id, path: `${_col}/${id}` })),
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

// NO friendService mock — the real subscribeFriendsList runs and calls
// the mocked onSnapshot above, so we can verify it registers an error
// handler and responds correctly to Firestore events.

import { addDoc, onSnapshot } from 'firebase/firestore';
import { useLobby } from './useLobby';

describe('useLobby (integration)', () => {
  /**
   * Helper: find the onSnapshot call whose query targets a specific
   * collection name. Works for both lobbies queries (which include
   * where clauses) and the friends collection query.
   */
  function findSnapshotCallByCollection(collectionName) {
    return onSnapshotCalls.find(call => {
      const args = call.query?._queryArgs || [];
      return args.some(a => a._collectionName === collectionName);
    });
  }

  /**
   * Helper: find the onSnapshot call whose query filters on a specific
   * visibility value (for lobby queries only).
   */
  function findSnapshotCallByVisibility(visibility) {
    return onSnapshotCalls.find(call => {
      const args = call.query?._queryArgs || [];
      return args.some(
        a => a._type === 'where' && a.field === 'visibility' && a.val === visibility
      );
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshotCalls = [];
  });

  // ─── Listener setup ────────────────────────────────────────────

  it('should set up 3 real onSnapshot listeners: public lobbies, friends lobbies, friends list', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // Real subscribePublicLobbies, subscribeFriendsLobbies, and
    // subscribeFriendsList each call onSnapshot once.
    expect(onSnapshot).toHaveBeenCalledTimes(3);

    const publicCall = findSnapshotCallByVisibility('public');
    const friendsLobbyCall = findSnapshotCallByVisibility('friends');
    const friendsListCall = findSnapshotCallByCollection('friends');

    expect(publicCall).toBeDefined();
    expect(friendsLobbyCall).toBeDefined();
    expect(friendsListCall).toBeDefined();
  });

  it('should only set up 2 listeners when userUid is falsy (no friends list)', () => {
    renderHook(() => useLobby(null, 'TestUser', 'easy'));

    // subscribeFriendsList is skipped when userUid is falsy
    expect(onSnapshot).toHaveBeenCalledTimes(2);

    const publicCall = findSnapshotCallByVisibility('public');
    const friendsLobbyCall = findSnapshotCallByVisibility('friends');
    const friendsListCall = findSnapshotCallByCollection('friends');

    expect(publicCall).toBeDefined();
    expect(friendsLobbyCall).toBeDefined();
    // friends list listener should NOT exist
    expect(friendsListCall).toBeUndefined();
  });

  // ─── Every onSnapshot must have an error handler ───────────────

  it('should register error handlers on ALL onSnapshot listeners', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    expect(onSnapshotCalls.length).toBe(3);

    for (const call of onSnapshotCalls) {
      expect(call.errorCb).toBeDefined();
      expect(typeof call.errorCb).toBe('function');
    }
  });

  // ─── Public lobbies ────────────────────────────────────────────

  it('should return public lobbies from the real subscribePublicLobbies listener', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const publicCall = findSnapshotCallByVisibility('public');

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

  // ─── Friends list + friends lobbies filtering ──────────────────

  it('should filter friends lobbies to only show those hosted by actual friends', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const friendsListCall = findSnapshotCallByCollection('friends');
    const friendsLobbyCall = findSnapshotCallByVisibility('friends');

    // Friends list arrives first
    act(() => {
      friendsListCall.successCb({
        docs: [
          {
            id: 'pair-1',
            data: () => ({
              users: ['user-1', 'friend-A'],
              usernames: { 'user-1': 'Me', 'friend-A': 'Alice' },
              since: null
            })
          },
          {
            id: 'pair-2',
            data: () => ({
              users: ['user-1', 'friend-B'],
              usernames: { 'user-1': 'Me', 'friend-B': 'Bob' },
              since: null
            })
          }
        ]
      });
    });

    // Friends lobbies arrive — includes a stranger's lobby
    act(() => {
      friendsLobbyCall.successCb({
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

    const friendsListCall = findSnapshotCallByCollection('friends');
    const friendsLobbyCall = findSnapshotCallByVisibility('friends');

    act(() => {
      friendsListCall.successCb({ docs: [] });
    });

    act(() => {
      friendsLobbyCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'stranger-1', visibility: 'friends' }) }
        ]
      });
    });

    expect(result.current.friendsLobbies).toHaveLength(0);
  });

  it('should re-filter friends lobbies when friends list updates', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const friendsListCall = findSnapshotCallByCollection('friends');
    const friendsLobbyCall = findSnapshotCallByVisibility('friends');

    // Friends lobbies arrive before friends list -> should be empty
    act(() => {
      friendsLobbyCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'friend-A', visibility: 'friends' }) }
        ]
      });
    });
    expect(result.current.friendsLobbies).toHaveLength(0);

    // Now friends list arrives -> should re-filter and show the lobby
    act(() => {
      friendsListCall.successCb({
        docs: [
          {
            id: 'pair-1',
            data: () => ({
              users: ['user-1', 'friend-A'],
              usernames: { 'user-1': 'Me', 'friend-A': 'FriendA' },
              since: null
            })
          }
        ]
      });
    });
    expect(result.current.friendsLobbies).toHaveLength(1);
    expect(result.current.friendsLobbies[0].docId).toBe('fl-1');
  });

  it('should remove a lobby from friendsLobbies when friend is removed', () => {
    const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    const friendsListCall = findSnapshotCallByCollection('friends');
    const friendsLobbyCall = findSnapshotCallByVisibility('friends');

    act(() => {
      friendsListCall.successCb({
        docs: [
          { id: 'p1', data: () => ({ users: ['user-1', 'friend-A'], usernames: { 'friend-A': 'A' }, since: null }) },
          { id: 'p2', data: () => ({ users: ['user-1', 'friend-B'], usernames: { 'friend-B': 'B' }, since: null }) }
        ]
      });
    });
    act(() => {
      friendsLobbyCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'friend-A', visibility: 'friends' }) },
          { id: 'fl-2', data: () => ({ hostUid: 'friend-B', visibility: 'friends' }) }
        ]
      });
    });
    expect(result.current.friendsLobbies).toHaveLength(2);

    // friend-B is removed from friends list
    act(() => {
      friendsListCall.successCb({
        docs: [
          { id: 'p1', data: () => ({ users: ['user-1', 'friend-A'], usernames: { 'friend-A': 'A' }, since: null }) }
        ]
      });
    });
    expect(result.current.friendsLobbies).toHaveLength(1);
    expect(result.current.friendsLobbies[0].hostUid).toBe('friend-A');
  });

  // ─── Listener stability ────────────────────────────────────────

  it('should NOT tear down friends lobbies listener when friends list changes', () => {
    renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    // 3 onSnapshot calls: public, friends lobbies, friends list
    const initialCallCount = onSnapshot.mock.calls.length;
    expect(initialCallCount).toBe(3);

    const friendsListCall = findSnapshotCallByCollection('friends');

    // Simulate friends list changing multiple times
    act(() => {
      friendsListCall.successCb({
        docs: [{ id: 'p1', data: () => ({ users: ['user-1', 'a'], usernames: { a: 'A' }, since: null }) }]
      });
    });
    act(() => {
      friendsListCall.successCb({
        docs: [
          { id: 'p1', data: () => ({ users: ['user-1', 'a'], usernames: { a: 'A' }, since: null }) },
          { id: 'p2', data: () => ({ users: ['user-1', 'b'], usernames: { b: 'B' }, since: null }) }
        ]
      });
    });
    act(() => {
      friendsListCall.successCb({ docs: [] });
    });

    // No new onSnapshot calls — no listener thrashing
    expect(onSnapshot.mock.calls.length).toBe(initialCallCount);
  });

  it('should unsubscribe all listeners on unmount', () => {
    const { unmount } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

    unmount();

    // 3 onSnapshot unsubs (public + friends lobbies + friends list)
    expect(mockOnSnapshotUnsub).toHaveBeenCalledTimes(3);
  });

  // ─── Resilience — hostGame must work even when friends features fail ──

  describe('resilience — hostGame must work even when friends features fail', () => {
    it('should still create a game when subscribeFriendsLobbies onSnapshot errors immediately', async () => {
      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      const friendsLobbyCall = findSnapshotCallByVisibility('friends');
      // Simulate the onSnapshot error handler firing (missing index)
      act(() => {
        friendsLobbyCall.errorCb(new Error('Missing composite index for friends'));
      });

      addDoc.mockResolvedValueOnce({ id: 'new-lobby' });

      let hostResult;
      await act(async () => {
        hostResult = await result.current.hostGame('public');
      });

      expect(hostResult).not.toBeNull();
      expect(hostResult.docId).toBe('new-lobby');
    });

    it('should still create a game when subscribeFriendsList onSnapshot errors', async () => {
      const { result } = renderHook(() => useLobby('user-1', 'TestUser', 'easy'));

      const friendsListCall = findSnapshotCallByCollection('friends');
      // Simulate Firestore error on friends list listener
      act(() => {
        friendsListCall.errorCb(new Error('Permission denied on friends collection'));
      });

      addDoc.mockResolvedValueOnce({ id: 'new-lobby' });

      let hostResult;
      await act(async () => {
        hostResult = await result.current.hostGame('public');
      });

      expect(hostResult).not.toBeNull();
      expect(hostResult.docId).toBe('new-lobby');
    });

    it('should still create a game when subscribeFriendsLobbies throws synchronously', async () => {
      // Override onSnapshot to throw for the friends lobbies query
      const originalImpl = onSnapshot.getMockImplementation();
      onSnapshot.mockImplementation((q, successCb, errorCb) => {
        const args = q?._queryArgs || [];
        const isFriendsLobbyQuery = args.some(
          a => a._type === 'where' && a.field === 'visibility' && a.val === 'friends'
        );
        if (isFriendsLobbyQuery) {
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
      onSnapshot.mockImplementation(originalImpl || ((q, successCb, errorCb) => {
        onSnapshotCalls.push({ query: q, successCb, errorCb });
        return mockOnSnapshotUnsub;
      }));

      if (hookError) {
        expect.fail(
          `subscribeFriendsLobbies throwing crashed the hook, preventing game creation: ${hookError.message}`
        );
      }
    });

    it('should still create a game when subscribeFriendsList throws synchronously', async () => {
      // Override onSnapshot to throw for the friends collection query
      const originalImpl = onSnapshot.getMockImplementation();
      onSnapshot.mockImplementation((q, successCb, errorCb) => {
        const args = q?._queryArgs || [];
        const isFriendsCollectionQuery = args.some(
          a => a._collectionName === 'friends'
        );
        if (isFriendsCollectionQuery) {
          throw new Error('friendService module failed to load');
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
      onSnapshot.mockImplementation(originalImpl || ((q, successCb, errorCb) => {
        onSnapshotCalls.push({ query: q, successCb, errorCb });
        return mockOnSnapshotUnsub;
      }));

      if (hookError) {
        expect.fail(
          `subscribeFriendsList throwing crashed the hook, preventing game creation: ${hookError.message}`
        );
      }
    });
  });

  // ─── hostGame ──────────────────────────────────────────────────

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

  // ─── clearError ────────────────────────────────────────────────

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
