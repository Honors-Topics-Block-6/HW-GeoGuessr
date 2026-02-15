import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ─── TRUE end-to-end test: only mock Firestore boundary ──────────
// MultiplayerLobby → useLobby → lobbyService/friendsLobbyService/friendService
// All real code runs. Only firebase/firestore and ../../../firebase are faked.

vi.mock('../../firebase', () => ({
  db: { _marker: 'mock-db' }
}));

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

// NO mocks for useLobby, lobbyService, friendsLobbyService, or friendService

// Mock CSS import only
vi.mock('./MultiplayerLobby.css', () => ({}));

import { addDoc, onSnapshot } from 'firebase/firestore';
import MultiplayerLobby from './MultiplayerLobby';

function findSnapshotCallByVisibility(visibility) {
  return onSnapshotCalls.find(call => {
    const args = call.query?._queryArgs || [];
    return args.some(
      a => a._type === 'where' && a.field === 'visibility' && a.val === visibility
    );
  });
}

function findSnapshotCallByCollection(collectionName) {
  return onSnapshotCalls.find(call => {
    const args = call.query?._queryArgs || [];
    return args.some(a => a._collectionName === collectionName);
  });
}

describe('MultiplayerLobby (end-to-end integration)', () => {
  const defaultProps = {
    difficulty: 'easy',
    userUid: 'user-1',
    userUsername: 'TestUser',
    onJoinedLobby: vi.fn(),
    onBack: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshotCalls = [];
  });

  it('should render and set up all 3 real Firestore listeners on mount', () => {
    render(<MultiplayerLobby {...defaultProps} />);

    // 3 real onSnapshot calls: public, friends lobbies, friends list
    expect(onSnapshot).toHaveBeenCalledTimes(3);

    expect(findSnapshotCallByVisibility('public')).toBeDefined();
    expect(findSnapshotCallByVisibility('friends')).toBeDefined();
    expect(findSnapshotCallByCollection('friends')).toBeDefined();
  });

  it('should display public lobbies when Firestore sends data', () => {
    render(<MultiplayerLobby {...defaultProps} />);

    const publicCall = findSnapshotCallByVisibility('public');

    act(() => {
      publicCall.successCb({
        docs: [
          { id: 'pub-1', data: () => ({ hostUsername: 'Alice', difficulty: 'easy', players: [{ uid: 'a' }], maxPlayers: 2 }) }
        ]
      });
    });

    // The lobby should appear in the UI
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('should create a game with correct visibility when clicking Create Game', async () => {
    addDoc.mockResolvedValueOnce({ id: 'new-lobby-123' });

    render(<MultiplayerLobby {...defaultProps} />);

    const createBtn = screen.getByText('Create Game');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    // The REAL createLobby should have been called via addDoc
    expect(addDoc).toHaveBeenCalledTimes(1);
    const lobbyData = addDoc.mock.calls[0][1];
    expect(lobbyData.visibility).toBe('public');
    expect(lobbyData.hostUid).toBe('user-1');
    expect(lobbyData.status).toBe('waiting');

    // onJoinedLobby should have been called with the doc ID
    expect(defaultProps.onJoinedLobby).toHaveBeenCalledWith('new-lobby-123');
  });

  it('should create a friends lobby when Friends visibility is selected', async () => {
    addDoc.mockResolvedValueOnce({ id: 'friends-lobby-456' });

    render(<MultiplayerLobby {...defaultProps} />);

    // Click Friends toggle
    const friendsBtn = screen.getByText('Friends').closest('button');
    fireEvent.click(friendsBtn);

    const createBtn = screen.getByText('Create Game');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    const lobbyData = addDoc.mock.calls[0][1];
    expect(lobbyData.visibility).toBe('friends');

    expect(defaultProps.onJoinedLobby).toHaveBeenCalledWith('friends-lobby-456');
  });

  it('should show error when createLobby fails and NOT call onJoinedLobby', async () => {
    addDoc.mockRejectedValueOnce(new Error('Firestore write failed'));

    render(<MultiplayerLobby {...defaultProps} />);

    const createBtn = screen.getByText('Create Game');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(defaultProps.onJoinedLobby).not.toHaveBeenCalled();
    expect(screen.getByText('Failed to create game. Please try again.')).toBeInTheDocument();
  });

  it('should create a game even when all friends features fail on mount', async () => {
    render(<MultiplayerLobby {...defaultProps} />);

    const friendsLobbyCall = findSnapshotCallByVisibility('friends');
    const friendsListCall = findSnapshotCallByCollection('friends');

    // Fire errors on friends features
    act(() => {
      friendsLobbyCall.errorCb(new Error('Missing index'));
    });
    act(() => {
      friendsListCall.errorCb(new Error('Permission denied'));
    });

    // Create Game should still work
    addDoc.mockResolvedValueOnce({ id: 'still-works' });

    const createBtn = screen.getByText('Create Game');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(defaultProps.onJoinedLobby).toHaveBeenCalledWith('still-works');
  });

  it('should display friends lobbies filtered by actual friends', () => {
    render(<MultiplayerLobby {...defaultProps} />);

    const friendsListCall = findSnapshotCallByCollection('friends');
    const friendsLobbyCall = findSnapshotCallByVisibility('friends');

    // Set up friends list
    act(() => {
      friendsListCall.successCb({
        docs: [
          { id: 'p1', data: () => ({ users: ['user-1', 'friend-A'], usernames: { 'friend-A': 'Alice' }, since: null }) }
        ]
      });
    });

    // Friends lobbies arrive — Alice's lobby + a stranger's
    act(() => {
      friendsLobbyCall.successCb({
        docs: [
          { id: 'fl-1', data: () => ({ hostUid: 'friend-A', hostUsername: 'Alice', difficulty: 'easy', players: [{ uid: 'friend-A' }], maxPlayers: 2, visibility: 'friends' }) },
          { id: 'fl-2', data: () => ({ hostUid: 'stranger', hostUsername: 'Stranger', difficulty: 'easy', players: [{ uid: 'stranger' }], maxPlayers: 2, visibility: 'friends' }) }
        ]
      });
    });

    // Alice's lobby should appear under Friends' Games
    // Stranger's lobby should NOT appear
    const aliceButtons = screen.getAllByText('Alice');
    expect(aliceButtons.length).toBeGreaterThan(0);

    // Stranger should not appear at all
    expect(screen.queryByText('Stranger')).not.toBeInTheDocument();
  });
});
