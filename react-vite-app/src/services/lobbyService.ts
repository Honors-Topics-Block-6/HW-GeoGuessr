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
  serverTimestamp,
  Timestamp,
  type FieldValue
} from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

export type LobbyStatus = 'waiting' | 'in_progress' | 'finished';
export type LobbyVisibility = 'public' | 'private';

export interface LobbyPlayer {
  uid: string;
  username: string;
  joinedAt: string;
}

export interface LobbyDoc {
  docId: string;
  hostUid: string;
  hostUsername: string;
  difficulty: string;
  visibility: LobbyVisibility;
  status: LobbyStatus;
  gameId: string;
  players: LobbyPlayer[];
  heartbeats: Record<string, Timestamp>;
  readyStatus: Record<string, boolean>;
  maxPlayers: number;
  /** Round time in seconds. 0 = no time limit. */
  roundTimeSeconds: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface CreateLobbyResult {
  docId: string;
  gameId: string;
}

// ────── Constants ──────

/** How long (ms) before a player's heartbeat is considered stale. */
export const STALE_TIMEOUT = 30_000;
/** Lobby lifetime before auto-expiry (1 hour). */
export const LOBBY_EXPIRY_MS = 60 * 60 * 1000;

export const MIN_LOBBY_PLAYERS = 2;
export const MAX_LOBBY_PLAYERS = 10;

// Characters that avoid ambiguity (no I, O, 0, 1)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

<<<<<<< Updated upstream
function getTimestampMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

function isLobbyExpired(lobby: Pick<LobbyDoc, 'createdAt'>): boolean {
  const createdMs = getTimestampMillis(lobby.createdAt);
  if (createdMs === null) return false;
  return Date.now() - createdMs >= LOBBY_EXPIRY_MS;
=======
function normalizeMaxPlayers(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return MIN_LOBBY_PLAYERS;
  const int = Math.trunc(n);
  return Math.max(MIN_LOBBY_PLAYERS, Math.min(MAX_LOBBY_PLAYERS, int));
>>>>>>> Stashed changes
}

// ────── Functions ──────

/**
 * Generate a random 6-character alphanumeric game code.
 */
export function generateGameId(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

/**
 * Create a new lobby document.
 */
export async function createLobby(
  hostUid: string,
  hostUsername: string,
  difficulty: string,
  visibility: LobbyVisibility,
<<<<<<< Updated upstream
  roundTimeSeconds: number = 20
=======
  maxPlayers: number = MIN_LOBBY_PLAYERS
>>>>>>> Stashed changes
): Promise<CreateLobbyResult> {
  const gameId = generateGameId();
  const now = serverTimestamp();
  const normalizedMaxPlayers = normalizeMaxPlayers(maxPlayers);

  const lobbyData = {
    hostUid,
    hostUsername,
    difficulty,
    visibility,
    status: 'waiting' as LobbyStatus,
    gameId,
    players: [{
      uid: hostUid,
      username: hostUsername,
      joinedAt: new Date().toISOString()
    }],
    heartbeats: {
      [hostUid]: Timestamp.now()
    },
    readyStatus: {
      [hostUid]: false
    },
<<<<<<< Updated upstream
    maxPlayers: 2,
    roundTimeSeconds,
=======
    maxPlayers: normalizedMaxPlayers,
>>>>>>> Stashed changes
    createdAt: now,
    updatedAt: now
  };

  const docRef = await addDoc(collection(db, 'lobbies'), lobbyData);
  return { docId: docRef.id, gameId };
}

/**
 * Find a lobby by its human-readable game code.
 * Only returns lobbies with status === 'waiting'.
 */
export async function findLobbyByGameId(gameId: string): Promise<LobbyDoc | null> {
  const q = query(
    collection(db, 'lobbies'),
    where('gameId', '==', gameId.toUpperCase()),
    where('status', '==', 'waiting')
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const lobby = { docId: docSnap.id, ...docSnap.data() } as LobbyDoc;
  if (isLobbyExpired(lobby)) {
    await deleteDoc(doc(db, 'lobbies', docSnap.id));
    return null;
  }
  return lobby;
}

/**
 * Join an existing lobby.
 * Validates status, capacity, difficulty match, and duplicate joins.
 */
export async function joinLobby(
  docId: string,
  playerUid: string,
  playerUsername: string,
  playerDifficulty: string
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) {
    throw new Error('Lobby not found.');
  }

  const lobby = lobbySnap.data() as Omit<LobbyDoc, 'docId'>;
  const normalizedMaxPlayers = normalizeMaxPlayers(lobby.maxPlayers);

  if (isLobbyExpired(lobby as Pick<LobbyDoc, 'createdAt'>)) {
    await deleteDoc(lobbyRef);
    throw new Error('This lobby has expired.');
  }

  if (lobby.status !== 'waiting') {
    throw new Error('This game has already started.');
  }

  if (lobby.difficulty !== playerDifficulty) {
    throw new Error(
      `Difficulty mismatch: this lobby is "${lobby.difficulty}" but you selected "${playerDifficulty}".`
    );
  }

  if (lobby.players.length >= normalizedMaxPlayers) {
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
    [`heartbeats.${playerUid}`]: Timestamp.now(),
    [`readyStatus.${playerUid}`]: false,
    updatedAt: serverTimestamp()
  });
}

/**
 * Leave a lobby. Removes the player from the players array.
 * If the lobby becomes empty, delete it.
 * If the leaving player was the host, transfer host to the next player.
 */
export async function leaveLobby(docId: string, playerUid: string): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data() as Omit<LobbyDoc, 'docId'>;
  const player = lobby.players.find(p => p.uid === playerUid);
  if (!player) return;

  const remainingPlayers = lobby.players.filter(p => p.uid !== playerUid);

  if (remainingPlayers.length === 0) {
    // No one left — delete the lobby
    await deleteDoc(lobbyRef);
    return;
  }

  const updates: Record<string, unknown> = {
    players: arrayRemove(player),
    updatedAt: serverTimestamp()
  };

  // Clean up ready status
  const newReadyStatus: Record<string, boolean> = { ...(lobby.readyStatus || {}) };
  delete newReadyStatus[playerUid];
  
  // Reset all remaining players to not ready when someone leaves
  remainingPlayers.forEach(p => {
    newReadyStatus[p.uid] = false;
  });
  
  updates.readyStatus = newReadyStatus;

  // Transfer host if the leaving player was the host
  if (lobby.hostUid === playerUid) {
    updates.hostUid = remainingPlayers[0].uid;
    updates.hostUsername = remainingPlayers[0].username;
  }

  await updateDoc(lobbyRef, updates);
}

/**
 * Subscribe to a single lobby document for real-time updates.
 */
export function subscribeLobby(
  docId: string,
  callback: (lobby: LobbyDoc | null) => void
): () => void {
  const lobbyRef = doc(db, 'lobbies', docId);
  return onSnapshot(lobbyRef, (snapshot) => {
    if (snapshot.exists()) {
      const lobby = { docId: snapshot.id, ...snapshot.data() } as LobbyDoc;
      if (isLobbyExpired(lobby)) {
        deleteDoc(lobbyRef).catch((err: unknown) => {
          console.error('Failed to delete expired lobby:', err);
        });
        callback(null);
        return;
      }
      callback(lobby);
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to all public lobbies that are waiting for players.
 */
export function subscribePublicLobbies(
  callback: (lobbies: LobbyDoc[]) => void
): () => void {
  const q = query(
    collection(db, 'lobbies'),
    where('visibility', '==', 'public'),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const lobbies = snapshot.docs
      .map(docSnap => ({
        docId: docSnap.id,
        ...docSnap.data()
      }) as LobbyDoc)
      .filter((lobby) => {
        const expired = isLobbyExpired(lobby);
        if (expired) {
          deleteDoc(doc(db, 'lobbies', lobby.docId)).catch((err: unknown) => {
            console.error('Failed to delete expired public lobby:', err);
          });
        }
        return !expired;
      });
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
      const lobbies = snapshot.docs
        .map(docSnap => ({
          docId: docSnap.id,
          ...docSnap.data()
        }) as LobbyDoc)
        .filter((lobby) => {
          const expired = isLobbyExpired(lobby);
          if (expired) {
            deleteDoc(doc(db, 'lobbies', lobby.docId)).catch((err: unknown) => {
              console.error('Failed to delete expired public lobby:', err);
            });
          }
          return !expired;
        });
      // Sort client-side as fallback
      lobbies.sort((a, b) => {
        const aTime = (a.createdAt as Timestamp | null)?.toMillis?.() || 0;
        const bTime = (b.createdAt as Timestamp | null)?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(lobbies);
    });
  });
}

/**
 * Update the lobby status (e.g. host starts the game).
 */
export async function updateLobbyStatus(docId: string, status: LobbyStatus): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    status,
    updatedAt: serverTimestamp()
  });
}

/**
 * Delete a lobby document.
 */
export async function deleteLobby(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'lobbies', docId));
}

/**
 * Send a heartbeat for the current player in a lobby.
 * Updates the player's entry in the `heartbeats` map with the current time.
 */
export async function sendHeartbeat(docId: string, playerUid: string): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    [`heartbeats.${playerUid}`]: Timestamp.now()
  });
}

/**
 * Remove players whose heartbeat has gone stale from a lobby.
 * If the lobby becomes empty after removal, it is deleted.
 * Returns whether the lobby was deleted.
 */
export async function removeStalePlayersFromLobby(
  docId: string,
  currentUid: string,
  staleTimeoutMs: number = STALE_TIMEOUT
): Promise<boolean> {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) return true;

  const lobby = lobbySnap.data() as Omit<LobbyDoc, 'docId'>;
  if (isLobbyExpired(lobby as Pick<LobbyDoc, 'createdAt'>)) {
    await deleteDoc(lobbyRef);
    return true;
  }
  const heartbeats = lobby.heartbeats || {};
  const now = Date.now();

  // Identify stale players (never skip the current user)
  const stalePlayers = lobby.players.filter(p => {
    if (p.uid === currentUid) return false;
    const lastSeen = heartbeats[p.uid];
    if (!lastSeen) return true; // No heartbeat ever recorded — stale
    const lastSeenMs = lastSeen.toMillis ? lastSeen.toMillis() : (lastSeen as unknown as number);
    return now - lastSeenMs > staleTimeoutMs;
  });

  if (stalePlayers.length === 0) return false;

  // Remove each stale player sequentially (mirrors leaveLobby logic)
  for (const stalePlayer of stalePlayers) {
    // Re-read to get fresh state (players/host may have changed)
    const freshSnap = await getDoc(lobbyRef);
    if (!freshSnap.exists()) return true;

    const fresh = freshSnap.data() as Omit<LobbyDoc, 'docId'>;
    const player = fresh.players.find(p => p.uid === stalePlayer.uid);
    if (!player) continue;

    const remaining = fresh.players.filter(p => p.uid !== stalePlayer.uid);

    if (remaining.length === 0) {
      await deleteDoc(lobbyRef);
      return true;
    }

    const updates: Record<string, unknown> = {
      players: arrayRemove(player),
      updatedAt: serverTimestamp()
    };

    // Clean up the heartbeat entry
    // Firestore doesn't support deleting a map key directly in updateDoc,
    // so we rebuild the heartbeats map without the stale player.
    const newHeartbeats: Record<string, Timestamp> = { ...fresh.heartbeats };
    delete newHeartbeats[stalePlayer.uid];
    updates.heartbeats = newHeartbeats;

    // Clean up ready status
    const newReadyStatus: Record<string, boolean> = { ...(fresh.readyStatus || {}) };
    delete newReadyStatus[stalePlayer.uid];
    updates.readyStatus = newReadyStatus;

    // Transfer host if needed
    if (fresh.hostUid === stalePlayer.uid) {
      updates.hostUid = remaining[0].uid;
      updates.hostUsername = remaining[0].username;
    }

    await updateDoc(lobbyRef, updates);
  }

  return false;
}

/**
 * Update the round time setting on a lobby document.
 * Only the host should call this (enforce in the UI).
 */
export async function updateLobbyRoundTime(
  docId: string,
  roundTimeSeconds: number
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    roundTimeSeconds,
    updatedAt: serverTimestamp()
  });
}

/**
 * Toggle a player's ready status in the lobby.
 */
export async function setPlayerReady(
  docId: string,
  playerUid: string,
  ready: boolean
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    [`readyStatus.${playerUid}`]: ready,
    updatedAt: serverTimestamp()
  });
}
