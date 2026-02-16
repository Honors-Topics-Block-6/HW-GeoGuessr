import { useState, useEffect, useCallback, useRef } from 'react';
import {
  subscribeChatMessages,
  sendChatMessage,
  markChatMessagesRead,
  getChatId,
  type ChatMessage as ServiceChatMessage
} from '../services/chatService';

export type ChatMessage = ServiceChatMessage & {
  [key: string]: unknown;
};

export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  chatId: string | null;
  loading: boolean;
}

/**
 * Hook for managing a single chat conversation.
 */
export function useChat(
  myUid: string | null,
  myUsername: string,
  friendUid: string | null
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedChatId, setLoadedChatId] = useState<string | null>(null);
  const chatId = myUid && friendUid ? getChatId(myUid, friendUid) : null;
  const markReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loading is true when we have a chatId that hasn't been loaded yet
  const loading = !!chatId && loadedChatId !== chatId;

  // Subscribe to chat messages
  useEffect(() => {
    if (!chatId) return;

    const unsubscribe = subscribeChatMessages(chatId, (msgs) => {
      setMessages(msgs as ChatMessage[]);
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
        markChatMessagesRead(chatId, myUid).catch((err: unknown) => {
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
  const sendMessage = useCallback(async (text: string): Promise<void> => {
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
