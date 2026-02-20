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
  writeBatch,
  type Timestamp as FirestoreTimestamp,
  type FieldValue
} from 'firebase/firestore';
import { db } from '../firebase';
import { censorText } from '../utils/chatCensor';

// ────── Types ──────

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderUsername: string;
  text: string;
  sentAt: FirestoreTimestamp | FieldValue | null;
  read: boolean;
  type?: 'lobby_invite';
  lobbyDocId?: string;
  difficulty?: string;
}

// ────── Functions ──────

/**
 * Get a chat ID for two users (sorted pair).
 */
export function getChatId(uid1: string, uid2: string): string {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

/**
 * Send a chat message between friends.
 */
export async function sendChatMessage(
  chatId: string,
  senderUid: string,
  senderUsername: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }
  if (trimmed.length > 1000) {
    throw new Error('Message is too long (max 1000 characters).');
  }

  const censored = censorText(trimmed);

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  await addDoc(messagesRef, {
    senderUid,
    senderUsername,
    text: censored,
    sentAt: serverTimestamp(),
    read: false
  });
}

/**
 * Subscribe to chat messages in real-time (ordered by sentAt ascending).
 * Returns unsubscribe function.
 */
export function subscribeChatMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  if (!chatId) return () => {};

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('sentAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as ChatMessage[];
    callback(messages);
  }, () => {
    // Fallback if index not set up
    const fallbackQ = query(messagesRef);
    return onSnapshot(fallbackQ, (snapshot) => {
      const messages = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as ChatMessage[];
      messages.sort((a, b) => {
        const aTime = (a.sentAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
        const bTime = (b.sentAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
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
export async function markChatMessagesRead(chatId: string, readerUid: string): Promise<void> {
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
export function subscribeUnreadCount(
  chatId: string,
  currentUid: string,
  callback: (count: number) => void
): () => void {
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

/**
 * Send a lobby invite as a special chat message to a friend.
 * The message includes lobby metadata so the recipient can join
 * directly from the chat via a "Join" button.
 */
export async function sendLobbyInvite(
  chatId: string,
  senderUid: string,
  senderUsername: string,
  lobbyDocId: string,
  difficulty: string
): Promise<void> {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  await addDoc(messagesRef, {
    type: 'lobby_invite',
    senderUid,
    senderUsername,
    text: `${senderUsername} invited you to a duel!`,
    lobbyDocId,
    difficulty,
    sentAt: serverTimestamp(),
    read: false
  });
}

// ────── Admin Functions ──────

/**
 * Get all messages in a chat (admin view).
 */
export async function getChatMessages(chatId: string): Promise<ChatMessage[]> {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('sentAt', 'asc'));

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as ChatMessage[];
  } catch {
    // Fallback without ordering
    const snapshot = await getDocs(collection(db, 'chats', chatId, 'messages'));
    const messages = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as ChatMessage[];
    messages.sort((a, b) => {
      const aTime = (a.sentAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
      const bTime = (b.sentAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
      return aTime - bTime;
    });
    return messages;
  }
}

/**
 * Admin delete a chat message.
 */
export async function adminDeleteMessage(chatId: string, messageId: string): Promise<void> {
  const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
  await deleteDoc(messageRef);
}
