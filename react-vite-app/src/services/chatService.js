import {
  doc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get a chat ID for two users (sorted pair).
 */
export function getChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

/**
 * Send a chat message between friends.
 */
export async function sendChatMessage(chatId, senderUid, senderUsername, text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }
  if (trimmed.length > 1000) {
    throw new Error('Message is too long (max 1000 characters).');
  }

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  await addDoc(messagesRef, {
    senderUid,
    senderUsername,
    text: trimmed,
    sentAt: serverTimestamp(),
    read: false
  });
}

/**
 * Subscribe to chat messages in real-time (ordered by sentAt ascending).
 * Returns unsubscribe function.
 */
export function subscribeChatMessages(chatId, callback) {
  if (!chatId) return () => {};

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('sentAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(messages);
  }, () => {
    // Fallback if index not set up
    const fallbackQ = query(messagesRef);
    return onSnapshot(fallbackQ, (snapshot) => {
      const messages = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      messages.sort((a, b) => {
        const aTime = a.sentAt?.toMillis?.() || 0;
        const bTime = b.sentAt?.toMillis?.() || 0;
        return aTime - bTime;
      });
      callback(messages);
    });
  });
}

/**
 * Mark all unread messages in a chat as read (for the reader).
 * Only marks messages NOT sent by the reader.
 */
export async function markChatMessagesRead(chatId, readerUid) {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(
    messagesRef,
    where('read', '==', false)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    // Only mark messages from the OTHER user as read
    if (data.senderUid !== readerUid) {
      batch.update(docSnap.ref, { read: true });
    }
  });

  await batch.commit();
}

/**
 * Subscribe to unread message count for a specific chat.
 * Only counts messages NOT sent by the current user.
 * Returns unsubscribe function.
 */
export function subscribeUnreadCount(chatId, currentUid, callback) {
  if (!chatId) {
    callback(0);
    return () => {};
  }

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(
    messagesRef,
    where('read', '==', false)
  );

  return onSnapshot(q, (snapshot) => {
    // Count only messages from the other user
    const count = snapshot.docs.filter(d => d.data().senderUid !== currentUid).length;
    callback(count);
  }, () => {
    callback(0);
  });
}

// ────── Admin Functions ──────

/**
 * Get all messages in a chat (admin view).
 */
export async function getChatMessages(chatId) {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('sentAt', 'asc'));

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch {
    // Fallback without ordering
    const snapshot = await getDocs(collection(db, 'chats', chatId, 'messages'));
    const messages = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    messages.sort((a, b) => {
      const aTime = a.sentAt?.toMillis?.() || 0;
      const bTime = b.sentAt?.toMillis?.() || 0;
      return aTime - bTime;
    });
    return messages;
  }
}

/**
 * Admin delete a chat message.
 */
export async function adminDeleteMessage(chatId, messageId) {
  const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
  await deleteDoc(messageRef);
}
