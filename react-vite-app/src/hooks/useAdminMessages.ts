import { useState, useEffect, useCallback } from 'react';
import { subscribeToUserMessages, markMessageRead, type PresenceMessage } from '../services/presenceService';

export type AdminMessage = PresenceMessage & {
  [key: string]: unknown;
};

export interface UseAdminMessagesReturn {
  messages: AdminMessage[];
  dismissMessage: (messageId: string) => Promise<void>;
}

/**
 * Hook that listens for unread admin messages sent to the current user.
 */
export function useAdminMessages(uid: string | null | undefined): UseAdminMessagesReturn {
  const [messages, setMessages] = useState<AdminMessage[]>([]);

  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeToUserMessages(uid, (newMessages) => {
      setMessages(newMessages as AdminMessage[]);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      // Clear messages when unsubscribing (uid changed or unmount)
      setMessages([]);
    };
  }, [uid]);

  const dismissMessage = useCallback(async (messageId: string): Promise<void> => {
    if (!uid) return;

    // Optimistically remove from local state
    setMessages(prev => prev.filter(m => m.id !== messageId));

    try {
      await markMessageRead(uid, messageId);
    } catch (err) {
      console.error('Failed to mark message as read:', err);
    }
  }, [uid]);

  return { messages, dismissMessage };
}
