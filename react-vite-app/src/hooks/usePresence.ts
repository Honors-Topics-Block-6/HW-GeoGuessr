import { useEffect, useRef, useCallback } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import {
  setPresenceOnline,
  setPresenceOffline,
  updatePresenceActivity,
  updatePresenceHeartbeat
} from '../services/presenceService';
import { updateUserDoc } from '../services/userService';

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds

export type ScreenState = string;

export interface FirebaseUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  [key: string]: unknown;
}

/**
 * Derive a friendly activity string from the app's current screen state.
 */
function getActivityString(
  screen: ScreenState,
  showSubmissionApp: boolean,
  showProfile: boolean,
  isAdmin: boolean,
  showLeaderboard: boolean,
  showFriends: boolean,
  showChat: boolean
): string {
  if (showChat) return 'Chatting';
  if (showFriends) return 'Friends List';
  if (showLeaderboard) return 'Viewing Leaderboard';
  if (showProfile) return 'Viewing Profile';
  if (showSubmissionApp && isAdmin) return 'In Admin Panel';
  if (showSubmissionApp) return 'Submitting Photos';

  const screenMap: Record<string, string> = {
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
 */
export function usePresence(
  user: FirebaseUser | null,
  screen: ScreenState,
  showSubmissionApp: boolean,
  showProfile: boolean,
  isAdmin: boolean,
  showLeaderboard: boolean = false,
  showFriends: boolean = false,
  showChat: boolean = false
): void {
  const prevUidRef = useRef<string | null>(null);
  const activityRef = useRef<string>('');

  const currentActivity = getActivityString(screen, showSubmissionApp, showProfile, isAdmin, showLeaderboard, showFriends, showChat);
  const setLastOnline = useCallback((uid: string): void => {
    updateUserDoc(uid, { lastOnline: serverTimestamp() }).catch(() => {
      // Best-effort update; ignore failures on unload
    });
  }, []);

  // Set presence online when user logs in, offline when they log out
  useEffect(() => {
    const uid = user?.uid || null;
    const prevUid = prevUidRef.current;

    // User logged out — mark previous user offline
    if (prevUid && prevUid !== uid) {
      setPresenceOffline(prevUid);
      setLastOnline(prevUid);
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
  const handleBeforeUnload = useCallback((): void => {
    const uid = user?.uid;
    if (uid) {
      setPresenceOffline(uid);
      setLastOnline(uid);
    }
  }, [user?.uid, setLastOnline]);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // On unmount, set offline (handles navigation away, StrictMode re-mount, etc.)
      setPresenceOffline(uid);
      setLastOnline(uid);
    };
  }, [user?.uid, handleBeforeUnload, setLastOnline]);
}
