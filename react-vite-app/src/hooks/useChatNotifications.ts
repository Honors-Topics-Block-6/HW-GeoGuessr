import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatId, subscribeChatMessages, type ChatMessage } from '../services/chatService';

export interface ChatNotificationItem {
  id: string;
  senderUid: string;
  senderUsername: string;
  text: string;
  sentAt: ChatMessage['sentAt'];
  type?: ChatMessage['type'];
  lobbyDocId?: ChatMessage['lobbyDocId'];
  difficulty?: ChatMessage['difficulty'];
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
            const isInvite =
              msg.type === 'lobby_invite' ||
              (typeof msg.lobbyDocId === 'string' && typeof msg.difficulty === 'string');
            const nextItem: ChatNotificationItem = {
              id: msg.id,
              senderUid: msg.senderUid,
              senderUsername: msg.senderUsername || 'Someone',
              text: msg.text,
              sentAt: msg.sentAt,
              type: isInvite ? 'lobby_invite' : msg.type,
              lobbyDocId: msg.lobbyDocId,
              difficulty: msg.difficulty
            };
            setNotifications((prev) => {
              if (!isInvite) return [...prev, nextItem];
              const filtered = prev.filter(
                (item) => !(item.type === 'lobby_invite' && item.senderUid === msg.senderUid)
              );
              return [...filtered, nextItem];
            });
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
