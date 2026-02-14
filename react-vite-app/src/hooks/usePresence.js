import { useEffect, useRef, useCallback } from 'react';
import {
  setPresenceOnline,
  setPresenceOffline,
  updatePresenceActivity,
  updatePresenceHeartbeat
} from '../services/presenceService';

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Derive a friendly activity string from the app's current screen state.
 */
function getActivityString(screen, showSubmissionApp, showProfile, isAdmin, showLeaderboard, showFriends, showChat) {
  if (showChat) return 'Chatting';
  if (showFriends) return 'Friends List';
  if (showLeaderboard) return 'Viewing Leaderboard';
  if (showProfile) return 'Viewing Profile';
  if (showSubmissionApp && isAdmin) return 'In Admin Panel';
  if (showSubmissionApp) return 'Submitting Photos';

  const screenMap = {
    title: 'Title Screen',
    difficultySelect: 'Selecting Difficulty',
    multiplayerLobby: 'In Multiplayer Lobby',
    waitingRoom: 'In Waiting Room',
    game: 'Playing Game',
    result: 'Viewing Results',
    finalResults: 'Viewing Final Results'
  };
  return screenMap[screen] || 'Browsing';
}

/**
 * Hook that manages the current user's online presence lifecycle.
 *
 * - Sets presence online when user is authenticated
 * - Updates activity when screen changes
 * - Sends heartbeat every 60 seconds
 * - Sets presence offline on unmount, logout, or page close
 *
 * @param {object|null} user - Firebase Auth user object
 * @param {string} screen - Current game screen state
 * @param {boolean} showSubmissionApp - Whether the submission/admin app is shown
 * @param {boolean} showProfile - Whether the profile screen is shown
 * @param {boolean} isAdmin - Whether the current user is an admin
 * @param {boolean} showLeaderboard - Whether the leaderboard screen is shown
 */
export function usePresence(user, screen, showSubmissionApp, showProfile, isAdmin, showLeaderboard = false, showFriends = false, showChat = false) {
  const prevUidRef = useRef(null);
  const activityRef = useRef('');

  const currentActivity = getActivityString(screen, showSubmissionApp, showProfile, isAdmin, showLeaderboard, showFriends, showChat);

  // Set presence online when user logs in, offline when they log out
  useEffect(() => {
    const uid = user?.uid || null;
    const prevUid = prevUidRef.current;

    // User logged out — mark previous user offline
    if (prevUid && prevUid !== uid) {
      setPresenceOffline(prevUid);
    }

    // User logged in — mark online
    if (uid) {
      setPresenceOnline(uid, currentActivity);
      activityRef.current = currentActivity;
    }

    prevUidRef.current = uid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Update activity when screen state changes
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    // Only update if activity actually changed
    if (currentActivity !== activityRef.current) {
      activityRef.current = currentActivity;
      updatePresenceActivity(uid, currentActivity);
    }
  }, [user?.uid, currentActivity]);

  // Heartbeat interval — refresh lastSeen every 60 seconds
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    const interval = setInterval(() => {
      updatePresenceHeartbeat(uid);
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user?.uid]);

  // Cleanup: set offline on unmount and beforeunload
  const handleBeforeUnload = useCallback(() => {
    const uid = user?.uid;
    if (uid) {
      setPresenceOffline(uid);
    }
  }, [user?.uid]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // On unmount, set offline (handles navigation away, StrictMode re-mount, etc.)
      setPresenceOffline(uid);
    };
  }, [user?.uid, handleBeforeUnload]);
}
