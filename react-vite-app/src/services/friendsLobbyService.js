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
  let fallbackUnsub = null;

  const q = query(
    collection(db, 'lobbies'),
    where('visibility', '==', 'friends'),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'desc')
  );

  const primaryUnsub = onSnapshot(q, (snapshot) => {
    const lobbies = snapshot.docs.map(docSnap => ({
      docId: docSnap.id,
      ...docSnap.data()
    }));
    callback(lobbies);
  }, (error) => {
    console.error('Error subscribing to friends lobbies:', error);
    // Fallback: query without orderBy (in case index is missing)
    const fallbackQ = query(
      collection(db, 'lobbies'),
      where('visibility', '==', 'friends'),
      where('status', '==', 'waiting')
    );
    fallbackUnsub = onSnapshot(fallbackQ, (snapshot) => {
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
    }, (fallbackError) => {
      console.error('Fallback friends lobbies query also failed:', fallbackError);
      callback([]);
    });
  });

  // Return a cleanup function that unsubscribes from both listeners
  return () => {
    primaryUnsub();
    if (fallbackUnsub) fallbackUnsub();
  };
}
