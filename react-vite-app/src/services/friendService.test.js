import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Firestore boundary only ────────────────────────────────
vi.mock('../firebase', () => ({
  db: { _marker: 'mock-db' }
}));

let onSnapshotCalls = [];
const mockUnsub = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, _col, id) => ({ id, path: `${_col}/${id}` })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDocs: vi.fn(() => ({ empty: true, docs: [] })),
  collection: vi.fn((_db, name) => ({ _collectionName: name })),
  query: vi.fn((...args) => ({ _queryArgs: args })),
  where: vi.fn((field, op, val) => ({ _type: 'where', field, op, val })),
  orderBy: vi.fn((...args) => ({ _type: 'orderBy', args })),
  onSnapshot: vi.fn((q, successCb, errorCb) => {
    onSnapshotCalls.push({ query: q, successCb, errorCb });
    return mockUnsub;
  }),
  arrayUnion: vi.fn(val => val),
  arrayRemove: vi.fn(val => val),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' }))
}));

import { onSnapshot } from 'firebase/firestore';
import { subscribeFriendsList, subscribeFriendRequests } from './friendService';

describe('friendService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshotCalls = [];
  });

  describe('subscribeFriendsList', () => {
    it('should call onSnapshot with an error callback', () => {
      const callback = vi.fn();
      subscribeFriendsList('user-1', callback);

      expect(onSnapshot).toHaveBeenCalledTimes(1);
      const call = onSnapshotCalls[0];

      // The critical assertion: errorCb must be defined
      // Without it, Firestore errors become unhandled and crash the app
      expect(call.errorCb).toBeDefined();
      expect(typeof call.errorCb).toBe('function');
    });

    it('should query the friends collection with array-contains', () => {
      const callback = vi.fn();
      subscribeFriendsList('user-1', callback);

      const call = onSnapshotCalls[0];
      const queryArgs = call.query._queryArgs;

      // First arg is the collection ref
      expect(queryArgs[0]._collectionName).toBe('friends');

      // Second arg is the where clause
      const whereClause = queryArgs.find(a => a._type === 'where');
      expect(whereClause).toEqual({
        _type: 'where',
        field: 'users',
        op: 'array-contains',
        val: 'user-1'
      });
    });

    it('should call callback with empty array when onSnapshot error fires', () => {
      const callback = vi.fn();
      subscribeFriendsList('user-1', callback);

      const call = onSnapshotCalls[0];

      // Simulate Firestore error
      call.errorCb(new Error('Permission denied'));

      expect(callback).toHaveBeenCalledWith([]);
    });

    it('should map snapshot docs correctly on success', () => {
      const callback = vi.fn();
      subscribeFriendsList('user-1', callback);

      const call = onSnapshotCalls[0];

      call.successCb({
        docs: [
          {
            id: 'pair-1',
            data: () => ({
              users: ['user-1', 'friend-A'],
              usernames: { 'user-1': 'Me', 'friend-A': 'Alice' },
              since: 'some-timestamp'
            })
          }
        ]
      });

      expect(callback).toHaveBeenCalledWith([
        {
          pairId: 'pair-1',
          friendUid: 'friend-A',
          friendUsername: 'Alice',
          since: 'some-timestamp'
        }
      ]);
    });

    it('should return the unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = subscribeFriendsList('user-1', callback);
      expect(unsub).toBe(mockUnsub);
    });
  });

  describe('subscribeFriendRequests', () => {
    it('should call onSnapshot with an error callback', () => {
      const callback = vi.fn();
      subscribeFriendRequests('user-1', callback);

      expect(onSnapshot).toHaveBeenCalledTimes(1);
      const call = onSnapshotCalls[0];

      // Must have error handler to prevent unhandled Firestore errors
      expect(call.errorCb).toBeDefined();
      expect(typeof call.errorCb).toBe('function');
    });

    it('should call callback with empty array when onSnapshot error fires', () => {
      const callback = vi.fn();
      subscribeFriendRequests('user-1', callback);

      const call = onSnapshotCalls[0];
      call.errorCb(new Error('Network error'));

      expect(callback).toHaveBeenCalledWith([]);
    });
  });
});
