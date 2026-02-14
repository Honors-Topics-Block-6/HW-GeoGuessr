import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeFriendsList,
  subscribeFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend as removeFriendService,
  getOutgoingRequests
} from '../services/friendService';

const EMPTY_ARRAY = [];

/**
 * Hook that manages friends state: friends list, pending requests, and actions.
 *
 * @param {string|null|undefined} uid - The current user's UID
 * @param {string} username - The current user's username
 * @returns {{ friends, incomingRequests, outgoingRequests, sendRequest, acceptRequest, declineRequest, removeFriend, refreshOutgoing, loading, error }}
 */
export function useFriends(uid, username) {
  const [friends, setFriends] = useState(EMPTY_ARRAY);
  const [incomingRequests, setIncomingRequests] = useState(EMPTY_ARRAY);
  const [outgoingRequests, setOutgoingRequests] = useState(EMPTY_ARRAY);
  const [loadedUid, setLoadedUid] = useState(null);
  const [error, setError] = useState(null);

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
      setFriends(EMPTY_ARRAY);
      setLoadedUid(null);
    };
  }, [uid]);

  // Subscribe to incoming friend requests (real-time)
  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeFriendRequests(uid, (requests) => {
      setIncomingRequests(requests);
    });

    return () => {
      unsubscribe();
      setIncomingRequests(EMPTY_ARRAY);
    };
  }, [uid]);

  // Fetch outgoing requests (not real-time, refreshed on actions)
  const refreshOutgoing = useCallback(async () => {
    if (!uid) return;
    try {
      const requests = await getOutgoingRequests(uid);
      setOutgoingRequests(requests);
    } catch (err) {
      console.error('Failed to fetch outgoing requests:', err);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getOutgoingRequests(uid).then(requests => {
      if (!cancelled) setOutgoingRequests(requests);
    }).catch(err => {
      console.error('Failed to fetch outgoing requests:', err);
    });
    return () => { cancelled = true; };
  }, [uid]);

  // Send a friend request
  const sendRequest = useCallback(async (targetUid) => {
    if (!uid || !username) return;
    setError(null);
    try {
      await sendFriendRequest(uid, username, targetUid);
      await refreshOutgoing();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [uid, username, refreshOutgoing]);

  // Accept a friend request
  const acceptRequest = useCallback(async (requestId) => {
    setError(null);
    try {
      await acceptFriendRequest(requestId);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Decline a friend request
  const declineRequest = useCallback(async (requestId) => {
    setError(null);
    try {
      await declineFriendRequest(requestId);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  // Remove a friend
  const removeFriend = useCallback(async (friendUid) => {
    if (!uid) return;
    setError(null);
    try {
      await removeFriendService(uid, friendUid);
    } catch (err) {
      setError(err.message);
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
    removeFriend,
    refreshOutgoing,
    loading,
    error
  }), [friends, incomingRequests, outgoingRequests, sendRequest, acceptRequest, declineRequest, removeFriend, refreshOutgoing, loading, error]);
}
