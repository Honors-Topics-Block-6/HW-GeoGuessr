import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeFriendsList,
  subscribeFriendRequests,
  subscribeOutgoingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend as removeFriendService,
  type FriendDoc,
  type FriendRequestDoc
} from '../services/friendService';

export type Friend = FriendDoc;

export type FriendRequest = FriendRequestDoc & {
  [key: string]: unknown;
};

export interface UseFriendsReturn {
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  sendRequest: (targetUid: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendUid: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const EMPTY_FRIENDS: Friend[] = [];
const EMPTY_REQUESTS: FriendRequest[] = [];

/**
 * Hook that manages friends state: friends list, pending requests, and actions.
 */
export function useFriends(uid: string | null | undefined, username: string): UseFriendsReturn {
  const [friends, setFriends] = useState<Friend[]>(EMPTY_FRIENDS);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>(EMPTY_REQUESTS);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>(EMPTY_REQUESTS);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Loading is true when we have a uid that hasn't been loaded yet
  const loading = !!uid && loadedUid !== uid;

  // Subscribe to friends list (real-time)
  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeFriendsList(uid, (friendsList) => {
      setFriends(friendsList);
      setLoadedUid(uid);
    });

    return () => {
      unsubscribe();
      setFriends(EMPTY_FRIENDS);
      setLoadedUid(null);
    };
  }, [uid]);

  // Subscribe to incoming friend requests (real-time)
  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeFriendRequests(uid, (requests) => {
      setIncomingRequests(requests as FriendRequest[]);
    });

    return () => {
      unsubscribe();
      setIncomingRequests(EMPTY_REQUESTS);
    };
  }, [uid]);

  // Subscribe to outgoing friend requests (real-time)
  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeOutgoingRequests(uid, (requests) => {
      setOutgoingRequests(requests as FriendRequest[]);
    });

    return () => {
      unsubscribe();
      setOutgoingRequests(EMPTY_REQUESTS);
    };
  }, [uid]);

  // Send a friend request
  const sendRequest = useCallback(async (targetUid: string): Promise<void> => {
    if (!uid || !username) return;
    setError(null);
    try {
      await sendFriendRequest(uid, username, targetUid);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [uid, username]);

  // Accept a friend request
  const acceptRequest = useCallback(async (requestId: string): Promise<void> => {
    setError(null);
    try {
      await acceptFriendRequest(requestId);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  // Decline a friend request
  const declineRequest = useCallback(async (requestId: string): Promise<void> => {
    setError(null);
    try {
      await declineFriendRequest(requestId);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  // Cancel an outgoing friend request
  const cancelRequest = useCallback(async (requestId: string): Promise<void> => {
    if (!uid) return;
    setError(null);
    try {
      await cancelFriendRequest(requestId, uid);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [uid]);

  // Remove a friend
  const removeFriend = useCallback(async (friendUid: string): Promise<void> => {
    if (!uid) return;
    setError(null);
    try {
      await removeFriendService(uid, friendUid);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [uid]);

  return useMemo(() => ({
    friends,
    incomingRequests,
    outgoingRequests,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    loading,
    error
  }), [friends, incomingRequests, outgoingRequests, sendRequest, acceptRequest, declineRequest, cancelRequest, removeFriend, loading, error]);
}
