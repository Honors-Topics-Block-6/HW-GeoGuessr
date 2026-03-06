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
  setDoc,
  Timestamp,
  type FieldValue,
  type QuerySnapshot,
  type DocumentData
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
  /** Last meaningful player action timestamp (join/ready/start/guess/etc.). */
  lastActionAt?: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface UserLobbyHistoryDoc {
  docId: string;
  lobbyDocId: string;
  hostUid: string;
  hostUsername?: string;
  gameId: string;
  visibility: LobbyVisibility;
  difficulty: string;
  roundTimeSeconds: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  isDeleted: boolean;
  deletedAt?: Timestamp | FieldValue | null;
}

export interface CreateLobbyResult {
  docId: string;
  gameId: string;
}

// ────── Constants ──────

/** How long (ms) before a player's heartbeat is considered stale. */
export const STALE_TIMEOUT = 30_000;
/** Lobby inactivity timeout (10 minutes without player actions). */
export const LOBBY_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
/** Lobby lifetime before auto-expiry (1 hour). */
export const LOBBY_EXPIRY_MS = 60 * 60 * 1000;

// Characters that avoid ambiguity (no I, O, 0, 1)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
}

function isLobbyInactive(
  lobby: Pick<LobbyDoc, 'lastActionAt' | 'updatedAt' | 'createdAt'>,
  timeoutMs: number = LOBBY_INACTIVITY_TIMEOUT_MS
): boolean {
  const fallbackMs =
    getTimestampMillis(lobby.lastActionAt) ??
    getTimestampMillis(lobby.updatedAt) ??
    getTimestampMillis(lobby.createdAt);

  if (fallbackMs === null) return false;
  return Date.now() - fallbackMs >= timeoutMs;
}

async function markLobbyHistoryDeletedSafe(lobbyDocId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'userLobbyHistory', lobbyDocId), {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Failed to mark lobby history deleted:', err);
  }
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
  roundTimeSeconds: number = 30
): Promise<CreateLobbyResult> {
  const gameId = generateGameId();
  const now = serverTimestamp();

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
    maxPlayers: 2,
    roundTimeSeconds,
    lastActionAt: now,
    createdAt: now,
    updatedAt: now
  };

  const docRef = await addDoc(collection(db, 'lobbies'), lobbyData);
  const lobbyDocId = docRef.id;

  try {
    const historyRef = doc(db, 'userLobbyHistory', lobbyDocId);
    await setDoc(historyRef, {
      lobbyDocId,
      hostUid,
      hostUsername,
      gameId,
      visibility,
      difficulty,
      roundTimeSeconds,
      createdAt: now,
      updatedAt: now,
      isDeleted: false
    });
  } catch (err) {
    console.error('Failed to record lobby history:', err);
  }

  return { docId: lobbyDocId, gameId };
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
  if (isLobbyExpired(lobby) || isLobbyInactive(lobby)) {
    await deleteDoc(doc(db, 'lobbies', docSnap.id));
    await markLobbyHistoryDeletedSafe(docSnap.id);
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

  if (isLobbyExpired(lobby as Pick<LobbyDoc, 'createdAt'>)) {
    await deleteDoc(lobbyRef);
    await markLobbyHistoryDeletedSafe(docId);
    throw new Error('This lobby has expired.');
  }

  if (isLobbyInactive(lobby as Pick<LobbyDoc, 'lastActionAt' | 'updatedAt' | 'createdAt'>)) {
    await deleteDoc(lobbyRef);
    await markLobbyHistoryDeletedSafe(docId);
    throw new Error('This lobby has closed due to inactivity.');
  }

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
    [`heartbeats.${playerUid}`]: Timestamp.now(),
    [`readyStatus.${playerUid}`]: false,
    lastActionAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Leave a lobby. Removes the player from the players array.
<<<<<<< auto-close-games
 * If the lobby becomes empty, delete it.
 * If the host leaves, close the lobby for everyone.
=======
 * If the lobby becomes empty or the host leaves, delete it.
>>>>>>> main
 */
export async function leaveLobby(docId: string, playerUid: string): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  const lobbySnap = await getDoc(lobbyRef);

  if (!lobbySnap.exists()) return;

  const lobby = lobbySnap.data() as Omit<LobbyDoc, 'docId'>;
  const player = lobby.players.find(p => p.uid === playerUid);
  if (!player) return;

<<<<<<< auto-close-games
  // Product behavior: if host leaves, the game closes for everyone.
  if (lobby.hostUid === playerUid) {
    await deleteDoc(lobbyRef);
    await markLobbyHistoryDeletedSafe(docId);
    return;
  }
=======
   // If the host leaves, close the game entirely by deleting the lobby.
   if (lobby.hostUid === playerUid) {
     await deleteDoc(lobbyRef);
     return;
   }
>>>>>>> main

  const remainingPlayers = lobby.players.filter(p => p.uid !== playerUid);

  if (remainingPlayers.length === 0) {
    // No one left — delete the lobby
    await deleteDoc(lobbyRef);
    await markLobbyHistoryDeletedSafe(docId);
    return;
  }

  const updates: Record<string, unknown> = {
    players: arrayRemove(player),
    lastActionAt: serverTimestamp(),
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

  await updateDoc(lobbyRef, updates);
}

/**
 * Subscribe to a single lobby document for real-time updates.
 */
export function subscribeLobby(
  docId: string,
  callback: (lobby: LobbyDoc | null, reason?: 'inactive' | 'missing') => void
): () => void {
  const lobbyRef = doc(db, 'lobbies', docId);
  return onSnapshot(lobbyRef, (snapshot) => {
    if (snapshot.exists()) {
      const lobby = { docId: snapshot.id, ...snapshot.data() } as LobbyDoc;
      if (isLobbyExpired(lobby) || isLobbyInactive(lobby)) {
        deleteDoc(lobbyRef).catch((err: unknown) => {
          console.error('Failed to delete inactive/expired lobby:', err);
        });
        markLobbyHistoryDeletedSafe(docId).catch(() => { });
        callback(null, 'inactive');
        return;
      }
      callback(lobby);
    } else {
      callback(null, 'missing');
    }
  });
}

/**
 * Subscribe to all public lobbies that are waiting for players.
 */
export function subscribePublicLobbies(
  callback: (lobbies: LobbyDoc[]) => void
): () => void {
  const buildLobbies = (snapshot: QuerySnapshot<DocumentData>): LobbyDoc[] => {
    return snapshot.docs
      .map(docSnap => ({
        docId: docSnap.id,
        ...docSnap.data()
      }) as LobbyDoc)
      .filter((lobby) => {
        const expired = isLobbyExpired(lobby);
        const inactive = isLobbyInactive(lobby);
        if (expired || inactive) {
          deleteDoc(doc(db, 'lobbies', lobby.docId)).catch((err: unknown) => {
            console.error('Failed to delete inactive/expired public lobby:', err);
          });
          markLobbyHistoryDeletedSafe(lobby.docId).catch(() => { });
        }
        return !expired && !inactive;
      });
  };

  const orderedQuery = query(
    collection(db, 'lobbies'),
    where('visibility', '==', 'public'),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'desc')
  );

  const fallbackQuery = query(
    collection(db, 'lobbies'),
    where('visibility', '==', 'public'),
    where('status', '==', 'waiting')
  );

  let unsubscribe = () => { };

  const startFallback = (): void => {
    unsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
      const lobbies = buildLobbies(snapshot);
      lobbies.sort((a, b) => {
        const aTime = (a.createdAt as Timestamp | null)?.toMillis?.() || 0;
        const bTime = (b.createdAt as Timestamp | null)?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(lobbies);
    }, (error) => {
      console.error('Error subscribing to public lobbies (fallback):', error);
    });
  };

  unsubscribe = onSnapshot(orderedQuery, (snapshot) => {
    callback(buildLobbies(snapshot));
  }, (error) => {
    console.error('Error subscribing to public lobbies:', error);
    unsubscribe();
    startFallback();
  });

  return () => {
    unsubscribe();
  };
}

/**
 * Subscribe to all lobbies hosted by a specific user.
 */
export function subscribeUserLobbies(
  hostUid: string,
  callback: (lobbies: LobbyDoc[]) => void
): () => void {
  if (!hostUid) {
    callback([]);
    return () => { };
  }

  const q = query(
    collection(db, 'lobbies'),
    where('hostUid', '==', hostUid),
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
        const inactive = isLobbyInactive(lobby);
        if (expired || inactive) {
          deleteDoc(doc(db, 'lobbies', lobby.docId)).catch((err: unknown) => {
            console.error('Failed to delete inactive/expired lobby:', err);
          });
          markLobbyHistoryDeletedSafe(lobby.docId).catch(() => { });
        }
        return !expired && !inactive;
      });
    callback(lobbies);
  }, (error) => {
    console.error('Error subscribing to user lobbies:', error);
    const fallbackQ = query(
      collection(db, 'lobbies'),
      where('hostUid', '==', hostUid)
    );
    return onSnapshot(fallbackQ, (snapshot) => {
      const lobbies = snapshot.docs
        .map(docSnap => ({
          docId: docSnap.id,
          ...docSnap.data()
        }) as LobbyDoc)
        .filter((lobby) => {
          const expired = isLobbyExpired(lobby);
          const inactive = isLobbyInactive(lobby);
          if (expired || inactive) {
            deleteDoc(doc(db, 'lobbies', lobby.docId)).catch((err: unknown) => {
              console.error('Failed to delete inactive/expired lobby:', err);
            });
            markLobbyHistoryDeletedSafe(lobby.docId).catch(() => { });
          }
          return !expired && !inactive;
        });
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
 * Subscribe to the lobby history for a specific user (created games).
 */
export function subscribeUserLobbyHistory(
  hostUid: string,
  callback: (lobbies: UserLobbyHistoryDoc[]) => void
): () => void {
  if (!hostUid) {
    callback([]);
    return () => { };
  }

  const q = query(
    collection(db, 'userLobbyHistory'),
    where('hostUid', '==', hostUid),
    where('isDeleted', '==', false),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const lobbies = snapshot.docs.map(docSnap => ({
      docId: docSnap.id,
      ...docSnap.data()
    })) as UserLobbyHistoryDoc[];
    callback(lobbies);
  }, (error) => {
    console.error('Error subscribing to lobby history:', error);
    const fallbackQ = query(
      collection(db, 'userLobbyHistory'),
      where('hostUid', '==', hostUid),
      where('isDeleted', '==', false)
    );
    return onSnapshot(fallbackQ, (snapshot) => {
      const lobbies = snapshot.docs.map(docSnap => ({
        docId: docSnap.id,
        ...docSnap.data()
      })) as UserLobbyHistoryDoc[];
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
 * Subscribe to all public lobby history entries (created games).
 */
export function subscribePublicLobbyHistory(
  callback: (lobbies: UserLobbyHistoryDoc[]) => void
): () => void {
  const orderedQuery = query(
    collection(db, 'userLobbyHistory'),
    where('visibility', '==', 'public'),
    where('isDeleted', '==', false),
    orderBy('createdAt', 'desc')
  );

  const fallbackQuery = query(
    collection(db, 'userLobbyHistory'),
    where('visibility', '==', 'public'),
    where('isDeleted', '==', false)
  );

  let unsubscribe = () => { };

  const startFallback = (): void => {
    unsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
      const lobbies = snapshot.docs.map(docSnap => ({
        docId: docSnap.id,
        ...docSnap.data()
      })) as UserLobbyHistoryDoc[];
      lobbies.sort((a, b) => {
        const aTime = (a.createdAt as Timestamp | null)?.toMillis?.() || 0;
        const bTime = (b.createdAt as Timestamp | null)?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(lobbies);
    }, (error) => {
      console.error('Error subscribing to public lobby history (fallback):', error);
    });
  };

  unsubscribe = onSnapshot(orderedQuery, (snapshot) => {
    const lobbies = snapshot.docs.map(docSnap => ({
      docId: docSnap.id,
      ...docSnap.data()
    })) as UserLobbyHistoryDoc[];
    callback(lobbies);
  }, (error) => {
    console.error('Error subscribing to public lobby history:', error);
    unsubscribe();
    startFallback();
  });

  return () => {
    unsubscribe();
  };
}

/**
 * Mark a lobby history record as deleted for a user.
 */
export async function markUserLobbyDeleted(lobbyDocId: string): Promise<void> {
  const historyRef = doc(db, 'userLobbyHistory', lobbyDocId);
  await updateDoc(historyRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Update the lobby status (e.g. host starts the game).
 */
export async function updateLobbyStatus(docId: string, status: LobbyStatus): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    status,
    lastActionAt: serverTimestamp(),
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
 * If the lobby becomes empty after removal or the host goes stale, it is deleted.
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
    await markLobbyHistoryDeletedSafe(docId);
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

<<<<<<< auto-close-games
    // Product behavior: if host goes stale/disconnects, close the lobby.
    if (fresh.hostUid === stalePlayer.uid) {
      await deleteDoc(lobbyRef);
      await markLobbyHistoryDeletedSafe(docId);
      return true;
    }

    if (remaining.length === 0) {
=======
    // If no one is left or the host has gone stale, delete the lobby (close the game).
    if (remaining.length === 0 || fresh.hostUid === stalePlayer.uid) {
>>>>>>> main
      await deleteDoc(lobbyRef);
      await markLobbyHistoryDeletedSafe(docId);
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
    lastActionAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Update the difficulty setting on a lobby document.
 * Only the host should call this (enforce in the UI).
 */
export async function updateLobbyDifficulty(
  docId: string,
  difficulty: string
): Promise<void> {
  const lobbyRef = doc(db, 'lobbies', docId);
  await updateDoc(lobbyRef, {
    difficulty,
    lastActionAt: serverTimestamp(),
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
    lastActionAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
