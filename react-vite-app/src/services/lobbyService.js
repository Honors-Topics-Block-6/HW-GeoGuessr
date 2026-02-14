import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

// Characters that avoid ambiguity (no I, O, 0, 1)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a random 6-character alphanumeric game code.
 */
export function generateGameId() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

/**
 * Create a new lobby document.
 * @param {string} hostUid - Host's UID
 * @param {string} hostUsername - Host's display name
 * @param {string} difficulty - 'all' | 'easy' | 'medium' | 'hard'
 * @param {string} visibility - 'public' | 'private'
 * @returns {{ docId: string, gameId: string }}
 */
export async function createLobby(hostUid, hostUsername, difficulty, visibility) {
  const gameId = generateGameId();
  const now = serverTimestamp();

  const lobbyData = {
    hostUid,
    hostUsername,
    difficulty,
    visibility,
    status: 'waiting',
    gameId,
    players: [{
      uid: hostUid,
      username: hostUsername,
      joinedAt: new Date().toISOString()
    }],
    maxPlayers: 8,
    createdAt: now,
    updatedAt: now
  };

  const docRef = await addDoc(collection(db, 'lobbies'), lobbyData);
  return { docId: docRef.id, gameId };
}

/**
 * Find a lobby by its human-readable game code.
 * Only returns lobbies with status === 'waiting'.
 * @param {string} gameId - The 6-character join code
 * @returns {{ docId: string, ...lobbyData } | null}
 */
export async function findLobbyByGameId(gameId) {
  const q = query(
    collection(db, 'lobbies'),
    where('gameId', '==', gameId.toUpperCase()),
    where('status', '==', 'waiting')
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return { docId: docSnap.id, ...docSnap.data() };
}

/**
 * Join an existing lobby.
 * Validates status, capacity, difficulty match, and duplicate joins.
 * @param {string} docId - Firestore document ID of the lobby
 * @param {string} playerUid - Joining player's UID
 * @param {string} playerUsername - Joining player's display name
 * @param {string} playerDifficulty - The difficulty the joining player selected
 */
export async function joinLobby(docId, playerUid, playerUsername, playerDifficulty) {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) {
    throw new Error('Lobby not found.');
  }

  const lobby = lobbySnap.data();

  if (lobby.status !== 'waiting') {
    throw new Error('This game has already started.');
  }

  if (lobby.difficulty !== playerDifficulty) {
    throw new Error(
      `Difficulty mismatch: this lobby is "${lobby.difficulty}" but you selected "${playerDifficulty}".`
    );
  }

  if (lobby.players.length >= lobby.maxPlayers) {
    throw new Error('This lobby is full.');
  }

  if (lobby.players.some(p => p.uid === playerUid)) {
    throw new Error('You are already in this lobby.');
  }

  await updateDoc(lobbyRef, {
    players: arrayUnion({
      uid: playerUid,
      username: playerUsername,
      joinedAt: new Date().toISOString()
    }),
    updatedAt: serverTimestamp()
  });
}

/**
 * Leave a lobby. Removes the player from the players array.
 * If the lobby becomes empty, delete it.
 * If the leaving player was the host, transfer host to the next player.
 * @param {string} docId - Firestore document ID of the lobby
 * @param {string} playerUid - Leaving player's UID
 */
export async function leaveLobby(docId, playerUid) {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data();
  const player = lobby.players.find(p => p.uid === playerUid);
  if (!player) return;

  const remainingPlayers = lobby.players.filter(p => p.uid !== playerUid);

  if (remainingPlayers.length === 0) {
    // No one left — delete the lobby
    await deleteDoc(lobbyRef);
    return;
  }

  const updates = {
    players: arrayRemove(player),
    updatedAt: serverTimestamp()
  };

  // Transfer host if the leaving player was the host
  if (lobby.hostUid === playerUid) {
    updates.hostUid = remainingPlayers[0].uid;
    updates.hostUsername = remainingPlayers[0].username;
  }

  await updateDoc(lobbyRef, updates);
}

/**
 * Subscribe to a single lobby document for real-time updates.
 * @param {string} docId - Firestore document ID
 * @param {function} callback - Called with lobby data on each update
 * @returns {function} Unsubscribe function
 */
export function subscribeLobby(docId, callback) {
  const lobbyRef = doc(db, 'lobbies', docId);
  return onSnapshot(lobbyRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ docId: snapshot.id, ...snapshot.data() });
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to all public lobbies that are waiting for players.
 * @param {function} callback - Called with an array of lobby objects
 * @returns {function} Unsubscribe function
 */
export function subscribePublicLobbies(callback) {
  const q = query(
    collection(db, 'lobbies'),
    where('visibility', '==', 'public'),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const lobbies = snapshot.docs.map(docSnap => ({
      docId: docSnap.id,
      ...docSnap.data()
    }));
    callback(lobbies);
  }, (error) => {
    console.error('Error subscribing to public lobbies:', error);
    // Fallback: query without orderBy (in case index is missing)
    const fallbackQ = query(
      collection(db, 'lobbies'),
      where('visibility', '==', 'public'),
      where('status', '==', 'waiting')
    );
    return onSnapshot(fallbackQ, (snapshot) => {
      const lobbies = snapshot.docs.map(docSnap => ({
        docId: docSnap.id,
        ...docSnap.data()
      }));
      // Sort client-side as fallback
      lobbies.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(lobbies);
    });
  });
}

/**
 * Update the lobby status (e.g. host starts the game).
 * @param {string} docId - Firestore document ID
 * @param {string} status - 'waiting' | 'in_progress' | 'finished'
 */
export async function updateLobbyStatus(docId, status) {
  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    status,
    updatedAt: serverTimestamp()
  });
}

/**
 * Delete a lobby document.
 * @param {string} docId - Firestore document ID
 */
export async function deleteLobby(docId) {
  await deleteDoc(doc(db, 'lobbies', docId));
}
