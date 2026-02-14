import {
  doc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Set a user's presence to online with their current activity.
 * Uses merge to create the document if it doesn't exist.
 */
export async function setPresenceOnline(uid, activity) {
  const presenceRef = doc(db, 'presence', uid);
  await setDoc(presenceRef, {
    uid,
    online: true,
    lastSeen: serverTimestamp(),
    currentActivity: activity
  }, { merge: true });
}

/**
 * Set a user's presence to offline.
 */
export async function setPresenceOffline(uid) {
  const presenceRef = doc(db, 'presence', uid);
  try {
    await updateDoc(presenceRef, {
      online: false,
      lastSeen: serverTimestamp()
    });
  } catch {
    // Document may not exist yet — ignore errors on cleanup
  }
}

/**
 * Update the user's current activity and refresh lastSeen.
 */
export async function updatePresenceActivity(uid, activity) {
  const presenceRef = doc(db, 'presence', uid);
  try {
    await updateDoc(presenceRef, {
      currentActivity: activity,
      lastSeen: serverTimestamp()
    });
  } catch {
    // If presence doc doesn't exist yet, create it
    await setPresenceOnline(uid, activity);
  }
}

/**
 * Heartbeat — refresh lastSeen timestamp only.
 */
export async function updatePresenceHeartbeat(uid) {
  const presenceRef = doc(db, 'presence', uid);
  try {
    await updateDoc(presenceRef, {
      lastSeen: serverTimestamp()
    });
  } catch {
    // Ignore if document doesn't exist
  }
}

/**
 * Subscribe to all presence documents (admin use).
 * Calls callback with an object keyed by uid containing presence data.
 * Returns the unsubscribe function.
 */
export function subscribeToAllPresence(callback) {
  const presenceRef = collection(db, 'presence');
  return onSnapshot(presenceRef, (snapshot) => {
    const presenceMap = {};
    snapshot.forEach((docSnap) => {
      presenceMap[docSnap.id] = docSnap.data();
    });
    callback(presenceMap);
  });
}

/**
 * Send a message to a user. Creates a document in their messages subcollection.
 */
export async function sendMessageToUser(recipientUid, text, senderUid, senderUsername) {
  const messagesRef = collection(db, 'presence', recipientUid, 'messages');
  await addDoc(messagesRef, {
    text,
    senderUid,
    senderUsername,
    sentAt: serverTimestamp(),
    read: false
  });
}

/**
 * Send a message to all users. Creates a message document in each user's messages subcollection.
 * @param {string[]} recipientUids - Array of user UIDs to message
 * @param {string} text - Message text
 * @param {string} senderUid - UID of the sender
 * @param {string} senderUsername - Display name of the sender
 * @returns {Promise<{ sent: number, failed: number }>} Result counts
 */
export async function sendMessageToAllUsers(recipientUids, text, senderUid, senderUsername) {
  let sent = 0;
  let failed = 0;

  const promises = recipientUids.map(async (uid) => {
    try {
      const messagesRef = collection(db, 'presence', uid, 'messages');
      await addDoc(messagesRef, {
        text,
        senderUid,
        senderUsername,
        sentAt: serverTimestamp(),
        read: false
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send message to ${uid}:`, err);
      failed++;
    }
  });

  await Promise.all(promises);
  return { sent, failed };
}

/**
 * Subscribe to unread messages for a user.
 * Calls callback with an array of unread message objects (including their id).
 * Returns the unsubscribe function.
 */
export function subscribeToUserMessages(uid, callback) {
  const messagesRef = collection(db, 'presence', uid, 'messages');
  const q = query(
    messagesRef,
    where('read', '==', false),
    orderBy('sentAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(messages);
  }, () => {
    // If the query fails (e.g., missing index), fall back to unordered query
    const fallbackQ = query(messagesRef, where('read', '==', false));
    return onSnapshot(fallbackQ, (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      // Sort client-side as fallback
      messages.sort((a, b) => {
        const aTime = a.sentAt?.toMillis?.() || 0;
        const bTime = b.sentAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(messages);
    });
  });
}

/**
 * Mark a message as read so it no longer appears in the unread list.
 */
export async function markMessageRead(recipientUid, messageId) {
  const messageRef = doc(db, 'presence', recipientUid, 'messages', messageId);
  await updateDoc(messageRef, { read: true });
}
