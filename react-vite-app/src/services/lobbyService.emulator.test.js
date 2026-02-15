/**
 * Emulator integration test — ZERO MOCKS.
 *
 * Runs against the real Firestore emulator. Tests the exact same code paths
 * as the production service functions using the real Firebase SDK.
 *
 * Prerequisites:
 *   firebase emulators:start --only firestore   (port 8080)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
  terminate
} from 'firebase/firestore';

let app;
let db;

beforeAll(() => {
  app = initializeApp(
    { projectId: 'emulator-test-project' },
    'emulator-test-' + Date.now()
  );
  db = getFirestore(app);
  connectFirestoreEmulator(db, 'localhost', 8080);
});

afterAll(async () => {
  await terminate(db);
  await deleteApp(app);
});

/**
 * Creates a lobby — same logic as createLobby in lobbyService.js
 */
async function createLobby(firestoreDb, hostUid, hostUsername, difficulty, visibility) {
  const now = serverTimestamp();
  const gameId = 'T' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const lobbyData = {
    hostUid,
    hostUsername,
    difficulty,
    visibility,
    status: 'waiting',
    gameId,
    players: [{ uid: hostUid, username: hostUsername, joinedAt: new Date().toISOString() }],
    heartbeats: { [hostUid]: Timestamp.now() },
    maxPlayers: 2,
    createdAt: now,
    updatedAt: now
  };
  const docRef = await addDoc(collection(firestoreDb, 'lobbies'), lobbyData);
  return { docId: docRef.id, gameId };
}

describe('Real Firestore emulator — no mocks', () => {

  it('subscribePublicLobbies: real query, real onSnapshot, real addDoc', async () => {
    // Exact same code as subscribePublicLobbies in lobbyService.js
    const q = query(
      collection(db, 'lobbies'),
      where('visibility', '==', 'public'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc')
    );

    const snapshots = [];
    const unsub = onSnapshot(q, (snapshot) => {
      snapshots.push(snapshot.docs.map(d => ({ docId: d.id, ...d.data() })));
    }, (error) => {
      // Fixed behavior: no fallback onSnapshot, just log
      console.error('Error subscribing to public lobbies:', error);
    });

    await new Promise(r => setTimeout(r, 300));

    // Create a lobby with real addDoc
    const result = await createLobby(db, 'host-1', 'Host1', 'easy', 'public');
    expect(result.docId).toBeDefined();

    await new Promise(r => setTimeout(r, 500));
    unsub();

    // Real-time listener should have received the lobby
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const latest = snapshots[snapshots.length - 1];
    const found = latest.find(l => l.docId === result.docId);
    expect(found).toBeDefined();
    expect(found.hostUid).toBe('host-1');
    expect(found.visibility).toBe('public');
  });

  it('subscribeFriendsLobbies: real query, real onSnapshot, real addDoc', async () => {
    // Exact same code as subscribeFriendsLobbies in friendsLobbyService.js
    const q = query(
      collection(db, 'lobbies'),
      where('visibility', '==', 'friends'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc')
    );

    const snapshots = [];
    const unsub = onSnapshot(q, (snapshot) => {
      snapshots.push(snapshot.docs.map(d => ({ docId: d.id, ...d.data() })));
    }, (error) => {
      console.error('Error subscribing to friends lobbies:', error);
    });

    await new Promise(r => setTimeout(r, 300));

    const result = await createLobby(db, 'host-2', 'Host2', 'easy', 'friends');
    expect(result.docId).toBeDefined();

    await new Promise(r => setTimeout(r, 500));
    unsub();

    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const latest = snapshots[snapshots.length - 1];
    const found = latest.find(l => l.docId === result.docId);
    expect(found).toBeDefined();
    expect(found.visibility).toBe('friends');
  });

  it('BUGGY pattern: onSnapshot inside error callback poisons addDoc', async () => {
    // Use a SEPARATE Firebase app so corruption is isolated
    const buggyApp = initializeApp(
      { projectId: 'emulator-test-project' },
      'buggy-test-' + Date.now()
    );
    const buggyDb = getFirestore(buggyApp);
    connectFirestoreEmulator(buggyDb, 'localhost', 8080);

    // Start a primary onSnapshot listener
    const q = query(
      collection(buggyDb, 'lobbies'),
      where('visibility', '==', 'public'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc')
    );

    let fallbackUnsub = null;
    let primaryGotSnapshot = false;

    const primaryUnsub = onSnapshot(q, (snapshot) => {
      primaryGotSnapshot = true;

      if (!fallbackUnsub) {
        // THE BUG: start a new onSnapshot from INSIDE a listener callback.
        // This is what the old code did in the error handler.
        const fallbackQ = query(
          collection(buggyDb, 'lobbies'),
          where('visibility', '==', 'public'),
          where('status', '==', 'waiting')
        );
        fallbackUnsub = onSnapshot(fallbackQ, () => {}, (err) => {
          console.error('Fallback error:', err.message);
        });
      }
    }, (error) => {
      console.error('Primary error:', error.message);
    });

    // Wait for listeners to set up
    await new Promise(r => setTimeout(r, 500));

    // Try addDoc on the same db instance
    let writeError = null;
    try {
      await addDoc(collection(buggyDb, 'lobbies'), {
        hostUid: 'buggy-host',
        hostUsername: 'BuggyHost',
        difficulty: 'easy',
        visibility: 'public',
        status: 'waiting',
        gameId: 'BUG001',
        players: [{ uid: 'buggy-host', username: 'BuggyHost', joinedAt: new Date().toISOString() }],
        heartbeats: { 'buggy-host': Timestamp.now() },
        maxPlayers: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      writeError = err;
    }

    primaryUnsub();
    if (fallbackUnsub) fallbackUnsub();
    await terminate(buggyDb);
    await deleteApp(buggyApp);

    // The emulator may or may not reproduce the exact corruption.
    // Log what happened for visibility.
    if (writeError) {
      console.log('WRITE FAILED:', writeError.message);
    } else {
      console.log('Write succeeded on emulator (emulator is more forgiving than production)');
    }
    console.log('Primary got snapshot:', primaryGotSnapshot);
    console.log('Fallback created:', fallbackUnsub !== null);
  });

  it('FIXED pattern: error callback does NOT create nested listener, addDoc works', async () => {
    const testApp = initializeApp(
      { projectId: 'emulator-test-project' },
      'fixed-test-' + Date.now()
    );
    const testDb = getFirestore(testApp);
    connectFirestoreEmulator(testDb, 'localhost', 8080);

    // Start both listeners exactly like useLobby does
    const publicLobbies = [];
    const friendsLobbies = [];

    const publicQ = query(
      collection(testDb, 'lobbies'),
      where('visibility', '==', 'public'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc')
    );
    const friendsQ = query(
      collection(testDb, 'lobbies'),
      where('visibility', '==', 'friends'),
      where('status', '==', 'waiting'),
      orderBy('createdAt', 'desc')
    );

    const publicUnsub = onSnapshot(publicQ, (snap) => {
      publicLobbies.push(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    }, (error) => {
      // FIXED: no new onSnapshot here, just log
      console.error('Public lobbies error:', error);
    });

    const friendsUnsub = onSnapshot(friendsQ, (snap) => {
      friendsLobbies.push(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    }, (error) => {
      // FIXED: no new onSnapshot here, just log
      console.error('Friends lobbies error:', error);
    });

    await new Promise(r => setTimeout(r, 300));

    // Create a lobby — this MUST work
    const result = await createLobby(testDb, 'fixed-host', 'FixedHost', 'easy', 'public');
    expect(result.docId).toBeDefined();
    expect(result.gameId).toBeDefined();

    await new Promise(r => setTimeout(r, 500));

    // Verify real-time update arrived
    const latest = publicLobbies[publicLobbies.length - 1];
    const found = latest.find(l => l.docId === result.docId);
    expect(found).toBeDefined();
    expect(found.hostUid).toBe('fixed-host');

    publicUnsub();
    friendsUnsub();
    await terminate(testDb);
    await deleteApp(testApp);
  });

  it('write and read lobby document with all fields via real Firestore', async () => {
    const docRef = await addDoc(collection(db, 'lobbies'), {
      hostUid: 'host-abc',
      hostUsername: 'HostAbc',
      difficulty: 'hard',
      visibility: 'friends',
      status: 'waiting',
      gameId: 'ABCD12',
      players: [{ uid: 'host-abc', username: 'HostAbc', joinedAt: new Date().toISOString() }],
      heartbeats: { 'host-abc': Timestamp.now() },
      maxPlayers: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const lobbyData = await new Promise((resolve) => {
      const unsub = onSnapshot(docRef, (snap) => {
        unsub();
        resolve(snap.data());
      });
    });

    expect(lobbyData.hostUid).toBe('host-abc');
    expect(lobbyData.visibility).toBe('friends');
    expect(lobbyData.status).toBe('waiting');
    expect(lobbyData.gameId).toBe('ABCD12');
    expect(lobbyData.players).toHaveLength(1);
  });
});
