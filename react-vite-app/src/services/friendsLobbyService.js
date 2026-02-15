import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Subscribe to friends-only lobbies that are waiting for players.
 * Returns all lobbies with visibility === 'friends' — the caller is
 * responsible for filtering to only show lobbies hosted by actual friends.
 * @param {function} callback - Called with an array of lobby objects
 * @returns {function} Unsubscribe function
 */
export function subscribeFriendsLobbies(callback) {
  const q = query(
    collection(db, 'lobbies'),
    where('visibility', '==', 'friends'),
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
    // DO NOT create a fallback onSnapshot here. Starting a new listener
    // inside an onSnapshot error callback corrupts Firestore's internal
    // WatchChangeAggregator state, causing INTERNAL ASSERTION FAILED errors
    // that break ALL subsequent Firestore operations (including writes).
    console.error('Error subscribing to friends lobbies:', error);
    console.error('Create the required composite index at the link above.');
    callback([]);
  });
}
