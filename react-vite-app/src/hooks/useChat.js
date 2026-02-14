import { useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeChatMessages,
  sendChatMessage,
  markChatMessagesRead,
  getChatId
} from '../services/chatService';

/**
 * Hook for managing a single chat conversation.
 *
 * @param {string|null} myUid - Current user's UID
 * @param {string} myUsername - Current user's username
 * @param {string|null} friendUid - Friend's UID (null when no chat is open)
 * @returns {{ messages, sendMessage, chatId, loading }}
 */
export function useChat(myUid, myUsername, friendUid) {
  const [messages, setMessages] = useState([]);
  const [loadedChatId, setLoadedChatId] = useState(null);
  const chatId = myUid && friendUid ? getChatId(myUid, friendUid) : null;
  const markReadTimeoutRef = useRef(null);

  // Loading is true when we have a chatId that hasn't been loaded yet
  const loading = !!chatId && loadedChatId !== chatId;

  // Subscribe to chat messages
  useEffect(() => {
    if (!chatId) return;

    const unsubscribe = subscribeChatMessages(chatId, (msgs) => {
      setMessages(msgs);
      setLoadedChatId(chatId);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      setMessages([]);
      setLoadedChatId(null);
    };
  }, [chatId]);

  // Auto-mark messages as read when chat is open and messages arrive
  useEffect(() => {
    if (!chatId || !myUid || messages.length === 0) return;

    // Debounce to avoid excessive writes
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
    }

    markReadTimeoutRef.current = setTimeout(() => {
      const hasUnread = messages.some(m => !m.read && m.senderUid !== myUid);
      if (hasUnread) {
        markChatMessagesRead(chatId, myUid).catch(err => {
          console.error('Failed to mark messages as read:', err);
        });
      }
    }, 500);

    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
      }
    };
  }, [chatId, myUid, messages]);

  // Send a message
  const sendMessage = useCallback(async (text) => {
    if (!chatId || !myUid) return;
    await sendChatMessage(chatId, myUid, myUsername, text);
  }, [chatId, myUid, myUsername]);

  return {
    messages,
    sendMessage,
    chatId,
    loading
  };
}
