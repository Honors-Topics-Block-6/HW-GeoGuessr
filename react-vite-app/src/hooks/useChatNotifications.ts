import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatId, subscribeChatMessages, type ChatMessage } from '../services/chatService';

export interface ChatNotificationItem {
  id: string;
  senderUsername: string;
  text: string;
  sentAt: ChatMessage['sentAt'];
}

export interface UseChatNotificationsReturn {
  notifications: ChatNotificationItem[];
  dismissNotification: (id: string) => void;
}

/**
 * Subscribes to all chats with the given friends and emits a notification when
 * a new message arrives from a friend. Skips notifications for the friend whose
 * chat is currently open (currentChatFriendUid).
 */
export function useChatNotifications(
  myUid: string | null,
  friendUids: string[],
  currentChatFriendUid: string | null
): UseChatNotificationsReturn {
  const [notifications, setNotifications] = useState<ChatNotificationItem[]>([]);
  const lastSeenMessageIdsRef = useRef<Record<string, Set<string>>>({});
  const initialLoadDoneRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!myUid || friendUids.length === 0) {
      lastSeenMessageIdsRef.current = {};
      initialLoadDoneRef.current = {};
      return;
    }

    const unsubscribes: Array<() => void> = [];
    const lastSeen = lastSeenMessageIdsRef.current;
    const initialLoadDone = initialLoadDoneRef.current;

    friendUids.forEach((friendUid) => {
      const chatId = getChatId(myUid, friendUid);
      if (!chatId) return;

      const unsubscribe = subscribeChatMessages(chatId, (messages) => {
        if (!lastSeen[chatId]) lastSeen[chatId] = new Set();
        const seen = lastSeen[chatId];
        const seenBeforeThisSnapshot = new Set(seen);
        const isFirstLoad = !initialLoadDone[chatId];

        messages.forEach((msg) => {
          seen.add(msg.id);
        });
        if (isFirstLoad) {
          initialLoadDone[chatId] = true;
          return;
        }

        const isCurrentlyViewing = currentChatFriendUid === friendUid;
        messages.forEach((msg) => {
          const isFromThem = msg.senderUid !== myUid;
          const isNew = !seenBeforeThisSnapshot.has(msg.id);

          if (isFromThem && isNew && !isCurrentlyViewing) {
            setNotifications((prev) => [
              ...prev,
              {
                id: msg.id,
                senderUsername: msg.senderUsername || 'Someone',
                text: msg.text,
                sentAt: msg.sentAt
              }
            ]);
          }
        });
      });

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach((fn) => fn());
    };
  }, [myUid, friendUids.join(','), currentChatFriendUid]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, dismissNotification };
}
