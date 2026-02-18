import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  serverTimestamp,
  type Timestamp as FirestoreTimestamp,
  type FieldValue
} from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

export interface UserLookup {
  uid: string;
  username: string;
  email: string;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';
export type FriendRequestDirection = 'incoming' | 'outgoing';

export interface FriendRequestDoc {
  id: string;
  fromUid: string;
  fromUsername: string;
  toUid: string;
  toUsername: string;
  status: FriendRequestStatus;
  createdAt: FirestoreTimestamp | FieldValue | null;
  respondedAt: FirestoreTimestamp | FieldValue | null;
  direction?: FriendRequestDirection;
}

export interface FriendDoc {
  pairId: string;
  friendUid: string;
  friendUsername: string;
  since: FirestoreTimestamp | FieldValue | null;
}

export interface FriendshipDoc {
  id: string;
  users: string[];
  usernames: Record<string, string>;
  since: FirestoreTimestamp | FieldValue | null;
}

// ────── Functions ──────

/**
 * Get a sorted friend pair ID (always uid1_uid2 where uid1 < uid2)
 */
export function getFriendPairId(uid1: string, uid2: string): string {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

/**
 * Look up a user document by UID.
 * Returns { uid, username, email } or null.
 */
export async function getUserByUid(uid: string): Promise<UserLookup | null> {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return { uid: snapshot.id, username: data.username, email: data.email };
}

/**
 * Look up a user document by email.
 * Returns { uid, username, email } or null.
 */
export async function getUserByEmail(email: string): Promise<UserLookup | null> {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', email.trim()));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  return { uid: docSnap.id, username: data.username, email: data.email };
}

/**
 * Resolve a user by UID or email.
 * If input contains '@', treats as email; otherwise treats as UID.
 */
export async function getUserByIdOrEmail(input: string): Promise<UserLookup | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    return getUserByEmail(trimmed);
  }
  return getUserByUid(trimmed);
}

/**
 * Check if two users are already friends.
 */
export async function areFriends(uid1: string, uid2: string): Promise<boolean> {
  const pairId = getFriendPairId(uid1, uid2);
  const friendRef = doc(db, 'friends', pairId);
  const snapshot = await getDoc(friendRef);
  return snapshot.exists();
}

/**
 * Check if there's already a pending friend request between two users.
 */
async function hasPendingRequest(fromUid: string, toUid: string): Promise<boolean> {
  const requestsRef = collection(db, 'friendRequests');

  // Check from -> to
  const q1 = query(
    requestsRef,
    where('fromUid', '==', fromUid),
    where('toUid', '==', toUid),
    where('status', '==', 'pending')
  );
  const snap1 = await getDocs(q1);
  if (!snap1.empty) return true;

  // Check to -> from
  const q2 = query(
    requestsRef,
    where('fromUid', '==', toUid),
    where('toUid', '==', fromUid),
    where('status', '==', 'pending')
  );
  const snap2 = await getDocs(q2);
  return !snap2.empty;
}

/**
 * Send a friend request.
 * Validates: not self, not already friends, no duplicate pending request.
 * Accepts targetIdOrEmail: either a user UID or an email address.
 */
export async function sendFriendRequest(
  fromUid: string,
  fromUsername: string,
  targetIdOrEmail: string
): Promise<void> {
  // Resolve target (UID or email) to user
  const targetUser = await getUserByIdOrEmail(targetIdOrEmail);
  if (!targetUser) {
    throw new Error('No user found with that User ID or email.');
  }

  const toUid = targetUser.uid;
  if (fromUid === toUid) {
    throw new Error('You cannot add yourself as a friend.');
  }

  // Check not already friends
  const alreadyFriends = await areFriends(fromUid, toUid);
  if (alreadyFriends) {
    throw new Error('You are already friends with this user.');
  }

  // Check no duplicate pending request
  const pending = await hasPendingRequest(fromUid, toUid);
  if (pending) {
    throw new Error('A friend request is already pending between you and this user.');
  }

  const requestsRef = collection(db, 'friendRequests');
  await addDoc(requestsRef, {
    fromUid,
    fromUsername,
    toUid,
    toUsername: targetUser.username,
    status: 'pending',
    createdAt: serverTimestamp(),
    respondedAt: null
  });
}

/**
 * Accept a friend request.
 * Updates request status and creates a friends document.
 */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  const requestRef = doc(db, 'friendRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('Friend request not found.');
  }

  const request = requestSnap.data() as {
    fromUid: string;
    fromUsername: string;
    toUid: string;
    toUsername: string;
    status: FriendRequestStatus;
  };
  if (request.status !== 'pending') {
    throw new Error('This request has already been responded to.');
  }

  // Update request status
  await updateDoc(requestRef, {
    status: 'accepted',
    respondedAt: serverTimestamp()
  });

  // Create friends document
  const pairId = getFriendPairId(request.fromUid, request.toUid);
  const friendRef = doc(db, 'friends', pairId);
  await setDoc(friendRef, {
    users: [request.fromUid, request.toUid],
    usernames: {
      [request.fromUid]: request.fromUsername,
      [request.toUid]: request.toUsername
    },
    since: serverTimestamp()
  });
}

/**
 * Decline a friend request.
 */
export async function declineFriendRequest(requestId: string): Promise<void> {
  const requestRef = doc(db, 'friendRequests', requestId);
  await updateDoc(requestRef, {
    status: 'declined',
    respondedAt: serverTimestamp()
  });
}

/**
 * Remove a friend (delete the friends document).
 */
export async function removeFriend(uid1: string, uid2: string): Promise<void> {
  const pairId = getFriendPairId(uid1, uid2);
  const friendRef = doc(db, 'friends', pairId);
  await deleteDoc(friendRef);
}

/**
 * Get friends list for a user.
 * Returns array of { pairId, friendUid, friendUsername, since }.
 */
export async function getFriendsList(uid: string): Promise<FriendDoc[]> {
  const friendsRef = collection(db, 'friends');
  const q = query(friendsRef, where('users', 'array-contains', uid));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(docSnap => {
    const data = docSnap.data() as { users: string[]; usernames: Record<string, string>; since: FirestoreTimestamp | FieldValue | null };
    const friendUid = data.users.find(u => u !== uid)!;
    return {
      pairId: docSnap.id,
      friendUid,
      friendUsername: data.usernames?.[friendUid] || 'Unknown',
      since: data.since
    };
  });
}

/**
 * Get incoming pending friend requests for a user.
 */
export async function getPendingRequests(uid: string): Promise<FriendRequestDoc[]> {
  const requestsRef = collection(db, 'friendRequests');
  const q = query(
    requestsRef,
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  })) as FriendRequestDoc[];
}

/**
 * Get outgoing pending friend requests from a user.
 */
export async function getOutgoingRequests(uid: string): Promise<FriendRequestDoc[]> {
  const requestsRef = collection(db, 'friendRequests');
  const q = query(
    requestsRef,
    where('fromUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  })) as FriendRequestDoc[];
}

/**
 * Subscribe to incoming pending friend requests (real-time).
 * Returns unsubscribe function.
 */
export function subscribeFriendRequests(
  uid: string,
  callback: (requests: FriendRequestDoc[]) => void
): () => void {
  const requestsRef = collection(db, 'friendRequests');
  const q = query(
    requestsRef,
    where('toUid', '==', uid),
    where('status', '==', 'pending')
  );
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as FriendRequestDoc[];
    // Sort client-side (in case index isn't set up)
    requests.sort((a, b) => {
      const aTime = (a.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
      const bTime = (b.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
      return bTime - aTime;
    });
    callback(requests);
  });
}

/**
 * Subscribe to friends list (real-time).
 * Returns unsubscribe function.
 */
export function subscribeFriendsList(
  uid: string,
  callback: (friends: FriendDoc[]) => void
): () => void {
  const friendsRef = collection(db, 'friends');
  const q = query(friendsRef, where('users', 'array-contains', uid));
  return onSnapshot(q, (snapshot) => {
    const friends = snapshot.docs.map(docSnap => {
      const data = docSnap.data() as { users: string[]; usernames: Record<string, string>; since: FirestoreTimestamp | FieldValue | null };
      const friendUid = data.users.find(u => u !== uid)!;
      return {
        pairId: docSnap.id,
        friendUid,
        friendUsername: data.usernames?.[friendUid] || 'Unknown',
        since: data.since
      };
    });
    callback(friends);
  });
}

// ────── Admin Functions ──────

/**
 * Get all friendships (admin).
 */
export async function getAllFriendships(): Promise<FriendshipDoc[]> {
  const friendsRef = collection(db, 'friends');
  const snapshot = await getDocs(friendsRef);
  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  })) as FriendshipDoc[];
}

/**
 * Get all friendships for a specific user (admin).
 */
export async function getUserFriendships(uid: string): Promise<FriendDoc[]> {
  return getFriendsList(uid);
}

/**
 * Admin force-remove a friendship.
 */
export async function adminRemoveFriend(uid1: string, uid2: string): Promise<void> {
  return removeFriend(uid1, uid2);
}

/**
 * Get all friend requests (sent and received) for a user (admin).
 */
export async function getUserFriendRequests(uid: string): Promise<FriendRequestDoc[]> {
  const requestsRef = collection(db, 'friendRequests');

  // Incoming
  const qIn = query(requestsRef, where('toUid', '==', uid));
  const snapIn = await getDocs(qIn);
  const incoming = snapIn.docs.map(d => ({ id: d.id, direction: 'incoming' as FriendRequestDirection, ...d.data() })) as FriendRequestDoc[];

  // Outgoing
  const qOut = query(requestsRef, where('fromUid', '==', uid));
  const snapOut = await getDocs(qOut);
  const outgoing = snapOut.docs.map(d => ({ id: d.id, direction: 'outgoing' as FriendRequestDirection, ...d.data() })) as FriendRequestDoc[];

  return [...incoming, ...outgoing].sort((a, b) => {
    const aTime = (a.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
    const bTime = (b.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
    return bTime - aTime;
  });
}
