import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatId, subscribeChatMessages, type ChatMessage } from '../services/chatService';

export interface LobbyInvite {
  id: string;
  senderUid: string;
  senderUsername: string;
  lobbyDocId: string;
  gameId?: string;
  difficulty: string;
  sentAt: ChatMessage['sentAt'];
}

export interface UseLobbyInvitesReturn {
  invites: LobbyInvite[];
  dismissInvite: (id: string) => void;
}

function getSentAtMillis(sentAt: ChatMessage['sentAt']): number {
  if (!sentAt || typeof sentAt !== 'object') return 0;
  const maybe = sentAt as { toMillis?: () => number };
  return typeof maybe.toMillis === 'function' ? maybe.toMillis() : 0;
}

/**
 * Subscribe to lobby invite messages across all friend chats.
 * Returns latest invite per sender, sorted by most recent.
 */
export function useLobbyInvites(
  myUid: string | null,
  friendUids: string[]
): UseLobbyInvitesReturn {
  const [invites, setInvites] = useState<LobbyInvite[]>([]);
  const invitesByChatRef = useRef<Record<string, LobbyInvite[]>>({});
  const dismissedIdsRef = useRef<Set<string>>(new Set());

  const recomputeInvites = useCallback(() => {
    const allInvites = Object.values(invitesByChatRef.current).flat();
    const latestBySender = new Map<string, LobbyInvite>();

    allInvites.forEach((invite) => {
      const existing = latestBySender.get(invite.senderUid);
      if (!existing || getSentAtMillis(invite.sentAt) > getSentAtMillis(existing.sentAt)) {
        latestBySender.set(invite.senderUid, invite);
      }
    });

    const merged = Array.from(latestBySender.values())
      .filter((invite) => !dismissedIdsRef.current.has(invite.id))
      .sort((a, b) => getSentAtMillis(b.sentAt) - getSentAtMillis(a.sentAt));

    setInvites(merged);
  }, []);

  useEffect(() => {
    if (!myUid || friendUids.length === 0) {
      invitesByChatRef.current = {};
      setInvites([]);
      return;
    }

    const unsubscribes: Array<() => void> = [];
    const chatInvites = invitesByChatRef.current;

    friendUids.forEach((friendUid) => {
      const chatId = getChatId(myUid, friendUid);
      if (!chatId) return;

      const unsubscribe = subscribeChatMessages(chatId, (messages) => {
        const inviteMessages = messages
          .filter((msg) =>
            msg.type === 'lobby_invite' &&
            msg.senderUid !== myUid &&
            typeof msg.lobbyDocId === 'string' &&
            typeof msg.difficulty === 'string'
          )
          .map((msg) => ({
            id: msg.id,
            senderUid: msg.senderUid,
            senderUsername: msg.senderUsername || 'Someone',
            lobbyDocId: msg.lobbyDocId as string,
            gameId: typeof msg.gameId === 'string' ? msg.gameId : undefined,
            difficulty: msg.difficulty as string,
            sentAt: msg.sentAt
          }));

        chatInvites[chatId] = inviteMessages;
        recomputeInvites();
      });

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach((fn) => fn());
    };
  }, [friendUids.join(','), myUid, recomputeInvites]);

  const dismissInvite = useCallback((id: string) => {
    dismissedIdsRef.current.add(id);
    setInvites((prev) => prev.filter((invite) => invite.id !== id));
  }, []);

  return { invites, dismissInvite };
}
