import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before importing the service
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

vi.mock('firebase/firestore', () => ({
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
  })
}));

import { onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { subscribeFriendsLobbies } from './friendsLobbyService';

describe('friendsLobbyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insideErrorCallback = false;
    firestoreCorrupted = false;
  });

  describe('subscribeFriendsLobbies', () => {
    it('should build a query filtering visibility=friends, status=waiting, ordered by createdAt', () => {
      const callback = vi.fn();
      subscribeFriendsLobbies(callback);

      expect(query).toHaveBeenCalledTimes(1);
      const queryArgs = query.mock.calls[0];

      // First arg: collection ref
      expect(queryArgs[0]._collectionName).toBe('lobbies');

      // Remaining args: where/orderBy constraints
      const constraints = queryArgs.slice(1);
      const wheres = constraints.filter(c => c._type === 'where');
      const orders = constraints.filter(c => c._type === 'orderBy');

      // Must filter on visibility=friends AND status=waiting
      expect(wheres).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'visibility', op: '==', val: 'friends' }),
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
      const unsubscribe = subscribeFriendsLobbies(callback);

      expect(onSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should pass friends lobbies to callback on snapshot', () => {
      let snapshotCallback;
      onSnapshot.mockImplementationOnce((q, cb) => {
        snapshotCallback = cb;
        return mockOnSnapshotUnsub;
      });

      const callback = vi.fn();
      subscribeFriendsLobbies(callback);

      snapshotCallback({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'friend-1', hostUsername: 'Friend', visibility: 'friends' }) }
        ]
      });

      expect(callback).toHaveBeenCalledTimes(1);
      const lobbies = callback.mock.calls[0][0];
      expect(lobbies).toHaveLength(1);
      expect(lobbies[0].docId).toBe('fl-1');
      expect(lobbies[0].visibility).toBe('friends');
    });

    it('should unsubscribe the listener on cleanup', () => {
      const primaryUnsub = vi.fn();
      onSnapshot.mockImplementationOnce(() => primaryUnsub);

      const callback = vi.fn();
      const cleanup = subscribeFriendsLobbies(callback);

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
      subscribeFriendsLobbies(callback);

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
  });
});
