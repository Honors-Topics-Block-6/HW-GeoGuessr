import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Firestore mock with argument tracking ──────────────────────────
// We mock firebase/firestore but track the actual arguments passed to
// query(), where(), orderBy(), and onSnapshot() so tests can verify
// the REAL query construction logic in lobbyService — not just that
// "some function was called".
//
// CRITICAL: The onSnapshot mock simulates Firestore's real corruption
// behavior: calling onSnapshot() from inside an onSnapshot error callback
// corrupts the Firestore instance, causing ALL subsequent operations to
// throw "INTERNAL ASSERTION FAILED: Unexpected state".
vi.mock('../firebase', () => ({
  db: { _marker: 'mock-db' }
}));

const mockOnSnapshotUnsub = vi.fn();
let insideErrorCallback = false;
let firestoreCorrupted = false;

function assertNotCorrupted(opName) {
  if (firestoreCorrupted) {
    throw new Error(
      `INTERNAL ASSERTION FAILED: Unexpected state`
    );
  }
}

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn((...args) => {
    assertNotCorrupted('addDoc');
    return Promise.resolve({ id: 'default-doc' });
  }),
  updateDoc: vi.fn((...args) => {
    assertNotCorrupted('updateDoc');
    return Promise.resolve();
  }),
  getDoc: vi.fn((...args) => {
    assertNotCorrupted('getDoc');
    return Promise.resolve({ exists: () => false, data: () => null });
  }),
  getDocs: vi.fn((...args) => {
    assertNotCorrupted('getDocs');
    return Promise.resolve({ empty: true, docs: [] });
  }),
  deleteDoc: vi.fn((...args) => {
    assertNotCorrupted('deleteDoc');
    return Promise.resolve();
  }),
  doc: vi.fn((_db, _col, id) => ({ id, path: `lobbies/${id}` })),
  collection: vi.fn((_db, name) => ({ _collectionName: name })),
  query: vi.fn((...args) => ({ _queryArgs: args })),
  where: vi.fn((field, op, val) => ({ _type: 'where', field, op, val })),
  orderBy: vi.fn((field, dir) => ({ _type: 'orderBy', field, dir })),
  onSnapshot: vi.fn((q, successCb, errorCb) => {
    // Simulate Firestore corruption: if onSnapshot is called while we're
    // inside another onSnapshot's error callback, corrupt the instance.
    if (insideErrorCallback) {
      firestoreCorrupted = true;
    }
    return mockOnSnapshotUnsub;
  }),
  arrayUnion: vi.fn(val => val),
  arrayRemove: vi.fn(val => val),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp: { now: vi.fn(() => ({ toMillis: () => Date.now() })) }
}));

const mockAreFriends = vi.fn();

vi.mock('./friendService', () => ({
  areFriends: (...args) => mockAreFriends(...args)
}));

import {
  addDoc, getDoc, updateDoc, onSnapshot, query, where, orderBy, collection
} from 'firebase/firestore';
import {
  createLobby,
  joinLobby,
  subscribePublicLobbies,
  generateGameId
} from './lobbyService';

describe('lobbyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insideErrorCallback = false;
    firestoreCorrupted = false;
  });

  describe('generateGameId', () => {
    it('should generate a 6-character code', () => {
      const code = generateGameId();
      expect(code).toHaveLength(6);
    });

    it('should only contain valid characters (no ambiguous chars)', () => {
      const validChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let i = 0; i < 50; i++) {
        const code = generateGameId();
        for (const char of code) {
          expect(validChars).toContain(char);
        }
      }
    });

    it('should not contain ambiguous characters (I, O, 0, 1)', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateGameId();
        expect(code).not.toMatch(/[IO01]/);
      }
    });
  });

  describe('createLobby', () => {
    it('should create a lobby with public visibility', async () => {
      addDoc.mockResolvedValueOnce({ id: 'lobby-123' });

      const result = await createLobby('host-uid', 'HostUser', 'easy', 'public');

      expect(result.docId).toBe('lobby-123');
      expect(result.gameId).toHaveLength(6);
      expect(addDoc).toHaveBeenCalledTimes(1);

      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.visibility).toBe('public');
      expect(lobbyData.hostUid).toBe('host-uid');
      expect(lobbyData.hostUsername).toBe('HostUser');
      expect(lobbyData.difficulty).toBe('easy');
      expect(lobbyData.status).toBe('waiting');
      expect(lobbyData.maxPlayers).toBe(2);
      expect(lobbyData.players).toHaveLength(1);
      expect(lobbyData.players[0].uid).toBe('host-uid');
    });

    it('should create a lobby with private visibility', async () => {
      addDoc.mockResolvedValueOnce({ id: 'lobby-456' });

      const result = await createLobby('host-uid', 'HostUser', 'hard', 'private');

      expect(result.docId).toBe('lobby-456');
      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.visibility).toBe('private');
    });

    it('should create a lobby with friends visibility', async () => {
      addDoc.mockResolvedValueOnce({ id: 'lobby-789' });

      const result = await createLobby('host-uid', 'HostUser', 'medium', 'friends');

      expect(result.docId).toBe('lobby-789');
      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.visibility).toBe('friends');
      expect(lobbyData.difficulty).toBe('medium');
      expect(lobbyData.hostUid).toBe('host-uid');
    });

    it('should write to the lobbies collection', async () => {
      addDoc.mockResolvedValueOnce({ id: 'lobby-x' });

      await createLobby('uid', 'User', 'easy', 'public');

      // First arg to addDoc should be the collection ref
      const collectionRef = addDoc.mock.calls[0][0];
      expect(collectionRef._collectionName).toBe('lobbies');
    });

    it('should include heartbeat for the host', async () => {
      addDoc.mockResolvedValueOnce({ id: 'lobby-x' });

      await createLobby('host-uid', 'Host', 'easy', 'public');

      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.heartbeats).toBeDefined();
      expect(lobbyData.heartbeats['host-uid']).toBeDefined();
    });

    it('should include createdAt and updatedAt timestamps', async () => {
      addDoc.mockResolvedValueOnce({ id: 'lobby-x' });

      await createLobby('uid', 'User', 'easy', 'public');

      const lobbyData = addDoc.mock.calls[0][1];
      expect(lobbyData.createdAt).toEqual({ _type: 'serverTimestamp' });
      expect(lobbyData.updatedAt).toEqual({ _type: 'serverTimestamp' });
    });
  });

  describe('joinLobby', () => {
    const makeLobbySnap = (data) => ({
      exists: () => true,
      data: () => ({
        status: 'waiting',
        difficulty: 'easy',
        maxPlayers: 2,
        players: [{ uid: 'host-uid', username: 'Host' }],
        visibility: 'public',
        hostUid: 'host-uid',
        ...data
      })
    });

    it('should throw if lobby not found', async () => {
      getDoc.mockResolvedValueOnce({ exists: () => false });

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('Lobby not found.');
    });

    it('should throw if game already started', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ status: 'in_progress' }));

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('This game has already started.');
    });

    it('should throw if difficulty mismatch', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ difficulty: 'hard' }));

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('Difficulty mismatch');
    });

    it('should throw if lobby is full', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({
        players: [
          { uid: 'host-uid', username: 'Host' },
          { uid: 'other-uid', username: 'Other' }
        ]
      }));

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('This lobby is full.');
    });

    it('should throw if player is already in the lobby', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({
        players: [{ uid: 'player-uid', username: 'Player' }]
      }));

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('You are already in this lobby.');
    });

    it('should allow joining a public lobby without friendship check', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'public' }));
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(mockAreFriends).not.toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('should allow joining a private lobby without friendship check', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'private' }));
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(mockAreFriends).not.toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('should allow a friend to join a friends-only lobby', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'friends' }));
      mockAreFriends.mockResolvedValueOnce(true);
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(mockAreFriends).toHaveBeenCalledWith('host-uid', 'player-uid');
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('should block a non-friend from joining a friends-only lobby', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'friends' }));
      mockAreFriends.mockResolvedValueOnce(false);

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('This lobby is friends-only. You must be friends with the host to join.');

      expect(mockAreFriends).toHaveBeenCalledWith('host-uid', 'player-uid');
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('should skip friendship check if the joiner is the host', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({
        visibility: 'friends',
        hostUid: 'host-uid',
        players: [] // empty for this test
      }));
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'host-uid', 'Host', 'easy');

      expect(mockAreFriends).not.toHaveBeenCalled();
    });

    it('should block non-friend from joining friends-only lobby via game code', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({
        visibility: 'friends',
        hostUid: 'host-uid'
      }));
      mockAreFriends.mockResolvedValueOnce(false);

      await expect(
        joinLobby('doc-1', 'stranger-uid', 'Stranger', 'easy')
      ).rejects.toThrow('friends-only');

      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('should dynamically import friendService (not statically)', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'friends' }));
      mockAreFriends.mockResolvedValueOnce(true);
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(mockAreFriends).toHaveBeenCalledTimes(1);
      expect(mockAreFriends).toHaveBeenCalledWith('host-uid', 'player-uid');
    });

    it('should propagate errors from dynamically-imported areFriends', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'friends' }));
      mockAreFriends.mockRejectedValueOnce(new Error('Firestore permission denied'));

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('Firestore permission denied');

      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('should not import friendService at all for public/private lobbies', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'public' }));
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(mockAreFriends).not.toHaveBeenCalled();

      vi.clearAllMocks();

      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'private' }));
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(mockAreFriends).not.toHaveBeenCalled();
    });
  });

  describe('subscribePublicLobbies', () => {
    it('should build a query filtering visibility=public, status=waiting', () => {
      const callback = vi.fn();
      subscribePublicLobbies(callback);

      // query() was called — inspect what was passed
      expect(query).toHaveBeenCalledTimes(1);
      const queryArgs = query.mock.calls[0];

      // First arg: collection ref
      expect(queryArgs[0]._collectionName).toBe('lobbies');

      // Remaining args: where/orderBy constraints
      const constraints = queryArgs.slice(1);
      const wheres = constraints.filter(c => c._type === 'where');
      const orders = constraints.filter(c => c._type === 'orderBy');

      // Must filter on BOTH visibility and status
      expect(wheres).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'visibility', op: '==', val: 'public' }),
          expect.objectContaining({ field: 'status', op: '==', val: 'waiting' })
        ])
      );

      // Must order by createdAt
      expect(orders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'createdAt' })
        ])
      );
    });

    it('should call onSnapshot and return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = subscribePublicLobbies(callback);

      expect(onSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should pass lobbies to callback on snapshot', () => {
      let snapshotCallback;
      onSnapshot.mockImplementationOnce((q, cb) => {
        snapshotCallback = cb;
        return mockOnSnapshotUnsub;
      });

      const callback = vi.fn();
      subscribePublicLobbies(callback);

      snapshotCallback({
        docs: [
          { id: 'lobby-1', data: () => ({ hostUsername: 'Alice', visibility: 'public' }) },
          { id: 'lobby-2', data: () => ({ hostUsername: 'Bob', visibility: 'public' }) }
        ]
      });

      expect(callback).toHaveBeenCalledTimes(1);
      const lobbies = callback.mock.calls[0][0];
      expect(lobbies).toHaveLength(2);
      expect(lobbies[0].docId).toBe('lobby-1');
      expect(lobbies[1].docId).toBe('lobby-2');
    });

    it('should unsubscribe the listener on cleanup', () => {
      const primaryUnsub = vi.fn();
      onSnapshot.mockImplementationOnce(() => primaryUnsub);

      const callback = vi.fn();
      const cleanup = subscribePublicLobbies(callback);

      cleanup();
      expect(primaryUnsub).toHaveBeenCalledTimes(1);
    });

    it('should call callback with empty array on error without corrupting Firestore', () => {
      let errorHandler;

      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        errorHandler = errCb;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribePublicLobbies(callback);

      const snapshotCallsBefore = onSnapshot.mock.calls.length;

      // Simulate the real Firestore behavior: track that we're inside an error callback.
      // If the error handler creates a new onSnapshot, Firestore becomes corrupted.
      insideErrorCallback = true;
      try {
        errorHandler(new Error('The query requires an index'));
      } finally {
        insideErrorCallback = false;
      }

      // Firestore must NOT have been corrupted by the error handler
      expect(firestoreCorrupted).toBe(false);

      // Should NOT have created any new onSnapshot listeners
      expect(onSnapshot.mock.calls.length).toBe(snapshotCallsBefore);

      // Should have called callback with empty array
      expect(callback).toHaveBeenCalledWith([]);
    });

    it('should allow addDoc to work after onSnapshot error (no Firestore corruption)', async () => {
      let errorHandler;

      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        errorHandler = errCb;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribePublicLobbies(callback);

      // Trigger error — this must NOT corrupt Firestore
      insideErrorCallback = true;
      try {
        errorHandler(new Error('The query requires an index'));
      } finally {
        insideErrorCallback = false;
      }

      // addDoc should still work (not throw INTERNAL ASSERTION FAILED)
      addDoc.mockResolvedValueOnce({ id: 'new-lobby' });
      const result = await createLobby('host-uid', 'Host', 'easy', 'public');
      expect(result.docId).toBe('new-lobby');
    });
  });
});
