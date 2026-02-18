import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeFriendsList,
  subscribeFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelOutgoingFriendRequest,
  removeFriend as removeFriendService,
  getOutgoingRequests,
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
  cancelOutgoingRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendUid: string) => Promise<void>;
  refreshOutgoing: () => Promise<void>;
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

  // Fetch outgoing requests (not real-time, refreshed on actions)
  const refreshOutgoing = useCallback(async (): Promise<void> => {
    if (!uid) return;
    try {
      const requests = await getOutgoingRequests(uid);
      setOutgoingRequests(requests as FriendRequest[]);
    } catch (err) {
      console.error('Failed to fetch outgoing requests:', err);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getOutgoingRequests(uid).then((requests) => {
      if (!cancelled) setOutgoingRequests(requests as FriendRequest[]);
    }).catch((err: unknown) => {
      console.error('Failed to fetch outgoing requests:', err);
    });
    return () => { cancelled = true; };
  }, [uid]);

  // Send a friend request
  const sendRequest = useCallback(async (targetUid: string): Promise<void> => {
    if (!uid || !username) return;
    setError(null);
    try {
      await sendFriendRequest(uid, username, targetUid);
      await refreshOutgoing();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [uid, username, refreshOutgoing]);

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

  // Cancel an outgoing request (delete the friendRequests doc)
  const cancelOutgoingRequest = useCallback(async (requestId: string): Promise<void> => {
    if (!uid) return;
    setError(null);
    try {
      await cancelOutgoingFriendRequest(requestId, uid);
      await refreshOutgoing();
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [uid, refreshOutgoing]);

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
    cancelOutgoingRequest,
    removeFriend,
    refreshOutgoing,
    loading,
    error
  }), [friends, incomingRequests, outgoingRequests, sendRequest, acceptRequest, declineRequest, cancelOutgoingRequest, removeFriend, refreshOutgoing, loading, error]);
}
