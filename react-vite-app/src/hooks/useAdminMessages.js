import { useState, useEffect, useCallback } from 'react';
import { subscribeToUserMessages, markMessageRead } from '../services/presenceService';

/**
 * Hook that listens for unread admin messages sent to the current user.
 *
 * @param {string|null|undefined} uid - The current user's UID
 * @returns {{ messages: Array, dismissMessage: function }}
 */
export function useAdminMessages(uid) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeToUserMessages(uid, (newMessages) => {
      setMessages(newMessages);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      // Clear messages when unsubscribing (uid changed or unmount)
      setMessages([]);
    };
  }, [uid]);

  const dismissMessage = useCallback(async (messageId) => {
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
