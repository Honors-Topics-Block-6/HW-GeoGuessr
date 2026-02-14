import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before importing the service
vi.mock('../firebase', () => ({
  db: { _marker: 'mock-db' }
}));

const mockOnSnapshotUnsub = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ _collectionName: name })),
  query: vi.fn((...args) => ({ _queryArgs: args })),
  where: vi.fn((field, op, val) => ({ _type: 'where', field, op, val })),
  orderBy: vi.fn((field, dir) => ({ _type: 'orderBy', field, dir })),
  onSnapshot: vi.fn(() => mockOnSnapshotUnsub)
}));

import { onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { subscribeFriendsLobbies } from './friendsLobbyService';

describe('friendsLobbyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it('should unsubscribe primary and fallback listeners on cleanup', () => {
      const primaryUnsub = vi.fn();
      const fallbackUnsub = vi.fn();
      let errorHandler;

      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        errorHandler = errCb;
        return primaryUnsub;
      });

      const callback = vi.fn();
      const cleanup = subscribeFriendsLobbies(callback);

      // Trigger fallback
      onSnapshot.mockImplementationOnce(() => fallbackUnsub);
      errorHandler(new Error('Missing index'));

      // Cleanup should unsubscribe both
      cleanup();
      expect(primaryUnsub).toHaveBeenCalledTimes(1);
      expect(fallbackUnsub).toHaveBeenCalledTimes(1);
    });

    it('should use fallback query WITHOUT orderBy when primary fails', () => {
      let errorHandler;

      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        errorHandler = errCb;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeFriendsLobbies(callback);

      // Clear to isolate the fallback query() call
      query.mockClear();
      where.mockClear();
      orderBy.mockClear();

      onSnapshot.mockImplementationOnce(() => vi.fn());
      errorHandler(new Error('Missing index'));

      // Fallback query should be built
      expect(query).toHaveBeenCalledTimes(1);
      const fallbackArgs = query.mock.calls[0];
      const fallbackConstraints = fallbackArgs.slice(1);
      const fallbackWheres = fallbackConstraints.filter(c => c._type === 'where');
      const fallbackOrders = fallbackConstraints.filter(c => c._type === 'orderBy');

      // Same where filters
      expect(fallbackWheres).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'visibility', op: '==', val: 'friends' }),
          expect.objectContaining({ field: 'status', op: '==', val: 'waiting' })
        ])
      );

      // NO orderBy in fallback
      expect(fallbackOrders).toHaveLength(0);
      expect(orderBy).not.toHaveBeenCalled();
    });

    it('should handle fallback error gracefully and return empty array', () => {
      let primaryErrorHandler;
      let fallbackErrorHandler;

      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        primaryErrorHandler = errCb;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeFriendsLobbies(callback);

      // Trigger fallback
      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        fallbackErrorHandler = errCb;
        return vi.fn();
      });
      primaryErrorHandler(new Error('Primary failed'));

      // Trigger fallback error
      fallbackErrorHandler(new Error('Fallback also failed'));

      expect(callback).toHaveBeenCalledWith([]);
    });

    it('should sort fallback results client-side by createdAt descending', () => {
      let primaryErrorHandler;
      let fallbackSnapshotCallback;

      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        primaryErrorHandler = errCb;
        return vi.fn();
      });

      const callback = vi.fn();
      subscribeFriendsLobbies(callback);

      // Trigger fallback
      onSnapshot.mockImplementationOnce((_q, cb) => {
        fallbackSnapshotCallback = cb;
        return vi.fn();
      });
      primaryErrorHandler(new Error('Index missing'));

      // Send unsorted data
      fallbackSnapshotCallback({
        docs: [
          { id: 'old', data: () => ({ createdAt: { toMillis: () => 1000 }, hostUid: 'a' }) },
          { id: 'new', data: () => ({ createdAt: { toMillis: () => 3000 }, hostUid: 'b' }) },
          { id: 'mid', data: () => ({ createdAt: { toMillis: () => 2000 }, hostUid: 'c' }) }
        ]
      });

      const lobbies = callback.mock.calls[0][0];
      expect(lobbies[0].docId).toBe('new');
      expect(lobbies[1].docId).toBe('mid');
      expect(lobbies[2].docId).toBe('old');
    });
  });
});
