import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase before importing the service
vi.mock('../firebase', () => ({
  db: {}
}));

const mockOnSnapshotUnsub = vi.fn();

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id, path: `lobbies/${id}` })),
  collection: vi.fn(),
  query: vi.fn((...args) => args),
  where: vi.fn((...args) => args),
  orderBy: vi.fn((...args) => args),
  onSnapshot: vi.fn(() => mockOnSnapshotUnsub),
  arrayUnion: vi.fn(val => val),
  arrayRemove: vi.fn(val => val),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp: { now: vi.fn(() => ({ toMillis: () => Date.now() })) }
}));

vi.mock('./friendService', () => ({
  areFriends: vi.fn()
}));

import { addDoc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { areFriends } from './friendService';
import {
  createLobby,
  joinLobby,
  subscribePublicLobbies,
  subscribeFriendsLobbies,
  generateGameId
} from './lobbyService';

describe('lobbyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      expect(areFriends).not.toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('should allow joining a private lobby without friendship check', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'private' }));
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(areFriends).not.toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('should allow a friend to join a friends-only lobby', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'friends' }));
      areFriends.mockResolvedValueOnce(true);
      updateDoc.mockResolvedValueOnce();

      await joinLobby('doc-1', 'player-uid', 'Player', 'easy');

      expect(areFriends).toHaveBeenCalledWith('host-uid', 'player-uid');
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('should block a non-friend from joining a friends-only lobby', async () => {
      getDoc.mockResolvedValueOnce(makeLobbySnap({ visibility: 'friends' }));
      areFriends.mockResolvedValueOnce(false);

      await expect(
        joinLobby('doc-1', 'player-uid', 'Player', 'easy')
      ).rejects.toThrow('This lobby is friends-only. You must be friends with the host to join.');

      expect(areFriends).toHaveBeenCalledWith('host-uid', 'player-uid');
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

      expect(areFriends).not.toHaveBeenCalled();
    });

    it('should block non-friend from joining friends-only lobby via game code', async () => {
      // This tests the same joinLobby path used by join-by-code
      getDoc.mockResolvedValueOnce(makeLobbySnap({
        visibility: 'friends',
        hostUid: 'host-uid'
      }));
      areFriends.mockResolvedValueOnce(false);

      await expect(
        joinLobby('doc-1', 'stranger-uid', 'Stranger', 'easy')
      ).rejects.toThrow('friends-only');

      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('subscribePublicLobbies', () => {
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

      // Simulate a Firestore snapshot
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

    it('should unsubscribe primary and fallback listeners on cleanup', () => {
      const primaryUnsub = vi.fn();
      onSnapshot.mockImplementationOnce(() => primaryUnsub);

      const callback = vi.fn();
      const cleanup = subscribePublicLobbies(callback);

      cleanup();
      expect(primaryUnsub).toHaveBeenCalledTimes(1);
    });

    it('should set up fallback listener on primary error and clean both up', () => {
      const primaryUnsub = vi.fn();
      const fallbackUnsub = vi.fn();
      let errorHandler;

      // Primary onSnapshot: capture the error handler
      onSnapshot.mockImplementationOnce((_q, _cb, errCb) => {
        errorHandler = errCb;
        return primaryUnsub;
      });

      const callback = vi.fn();
      const cleanup = subscribePublicLobbies(callback);

      // Simulate primary error, triggering fallback
      onSnapshot.mockImplementationOnce(() => fallbackUnsub);
      errorHandler(new Error('Missing index'));

      // Now cleanup should unsubscribe both
      cleanup();
      expect(primaryUnsub).toHaveBeenCalledTimes(1);
      expect(fallbackUnsub).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeFriendsLobbies', () => {
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
