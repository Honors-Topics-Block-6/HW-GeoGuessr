import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  signOut,
  sendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../firebase';
import {
  createUserDoc,
  getUserDoc,
  updateUserDoc,
  updateUserProfile,
  isUsernameTaken,
  checkUsernameAvailability,
  isHardcodedAdmin,
  getAllPermissions,
  getNoPermissions,
  ADMIN_PERMISSIONS,
  normalizeFavoriteEmote,
  UsernameTakenError
} from '../services/userService';
import { touchLastActive } from '../services/lastActiveService';
import { getLevelInfo, getLevelTitle } from '../utils/xpLevelling';
import { compressImage } from '../utils/compressImage';
import { coerceTimestampToDate } from '../utils/formatLastActive';

/**
 * Shape of the admin permissions object.
 * Each key corresponds to a permission string from ADMIN_PERMISSIONS,
 * and the value is a boolean indicating whether the permission is granted.
 */
export interface AdminPermissions {
  [permission: string]: boolean;
}

/**
 * Shape of the user document stored in Firestore.
 */
export interface UserDoc {
  uid: string;
  email: string;
  username: string;
  favoriteEmote?: string;
  photoURL?: string;
  isAdmin: boolean;
  emailVerified: boolean;
  totalXp: number;
  gamesPlayed: number;
  createdAt: unknown; // Firestore Timestamp or serverTimestamp sentinel
  permissions?: AdminPermissions;
  lastActive?: unknown;
  lastGameAt?: unknown;
  totalScore?: number;
  totalGuessTimeSeconds?: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount?: number;
  twentyFiveKCount?: number;
  photosSubmittedCount?: number;
  followersCount?: number;
  buildingStats?: Record<string, BuildingStat>;
  lastOnline?: unknown;
  dailyStats?: Record<string, DailyStatBucket>;
  dailyStatsByDifficulty?: Record<string, Record<string, DailyStatBucket>>;
}

export interface BuildingStat {
  building: string;
  floor: number | null;
  totalScore: number;
  count: number;
}

export interface DailyStatBucket {
  gamesPlayed: number;
  roundsPlayed?: number;
  totalScore: number;
  totalGuessTimeSeconds: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount: number;
  twentyFiveKCount: number;
  photosSubmittedCount: number;
  buildingStats: Record<string, BuildingStat>;
  byRoundCount?: Partial<Record<'5' | '10' | '20', DailyStatBucketRound>>;
}

export interface DailyStatBucketRound {
  gamesPlayed: number;
  roundsPlayed: number;
  totalScore: number;
  totalGuessTimeSeconds: number;
  fastestGuessTimeSeconds?: number;
  fiveKCount: number;
  twentyFiveKCount: number;
  buildingStats: Record<string, BuildingStat>;
}

/**
 * Level info returned by getLevelInfo().
 */
export interface LevelInfo {
  level: number;
  currentLevelXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progress: number;
}

/**
 * All fields and methods provided by the AuthContext.
 */
export interface AuthContextType {
  user: FirebaseUser | null;
  userDoc: UserDoc | null;
  loading: boolean;
  isGuest: boolean;
  needsUsername: boolean;
  isAdmin: boolean;
  permissions: AdminPermissions;
  hasPermission: (permission: string) => boolean;
  totalXp: number;
  levelInfo: LevelInfo;
  levelTitle: string;
  emailVerified: boolean;
  signup: (email: string, password: string, username: string) => Promise<FirebaseUser>;
  login: (email: string, password: string) => Promise<FirebaseUser>;
  loginWithGoogle: () => Promise<FirebaseUser>;
  continueAsGuest: () => Promise<FirebaseUser>;
  completeGoogleSignUp: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;
  updateFavoriteEmote: (favoriteEmote: string) => Promise<void>;
  updateProfileImage: (file: File) => Promise<string>;
  refreshUserDoc: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<FirebaseUser | null>(null);         // Firebase Auth user
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);    // Firestore user document
  const [loading, setLoading] = useState<boolean>(true);    // Initial auth check loading
  const [needsUsername, setNeedsUsername] = useState<boolean>(false); // Google sign-in needs username
  const [emailVerified, setEmailVerified] = useState<boolean>(false); // Email verification status
  const isGuest: boolean = !!user?.isAnonymous;

  const createGuestUserDoc = useCallback((firebaseUser: FirebaseUser): UserDoc => ({
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    username: 'Guest',
    isAdmin: false,
    emailVerified: true,
    totalXp: 0,
    gamesPlayed: 0,
    createdAt: new Date(),
    permissions: getNoPermissions()
  }), []);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        setUser(firebaseUser);
        const authVerified = firebaseUser?.emailVerified ?? false;

        if (firebaseUser) {
          if (firebaseUser.isAnonymous) {
            setEmailVerified(true);
            setUserDoc(createGuestUserDoc(firebaseUser));
            setNeedsUsername(false);
            return;
          }

          // Fetch the user's Firestore document
          const doc = await getUserDoc(firebaseUser.uid) as UserDoc | null;
          if (doc) {
            // Verified if either Firebase Auth or Firestore says so
            // (admin can set emailVerified in Firestore, user can verify via email link)
            const isVerified = authVerified || doc.emailVerified === true;
            setEmailVerified(isVerified);

            // Sync Firebase Auth -> Firestore when user verifies via email link
            if (authVerified && !doc.emailVerified) {
              await updateUserDoc(firebaseUser.uid, { emailVerified: true });
              doc.emailVerified = true;
            }

            setUserDoc(doc);
            setNeedsUsername(false);

            // Mark "last active" on session start (throttled, server time).
            const lastActiveDate = coerceTimestampToDate(doc.lastActive as unknown);
            const STALE_AFTER_MS = 5 * 60 * 1000;
            const shouldTouch = !lastActiveDate || (Date.now() - lastActiveDate.getTime() > STALE_AFTER_MS);
            if (shouldTouch) {
              void touchLastActive(firebaseUser.uid).then((didWrite) => {
                if (didWrite) {
                  setUserDoc(prev => (prev ? { ...prev, lastActive: new Date() } : prev));
                }
              });
            }
          } else {
            setEmailVerified(authVerified);
            // User exists in Auth but not in Firestore (Google sign-in, first time)
            setUserDoc(null);
            setNeedsUsername(true);
          }
        } else {
          setEmailVerified(false);
          setUserDoc(null);
          setNeedsUsername(false);
        }
      } catch (err) {
        console.error('Failed to initialize auth state:', err);
        setUserDoc(null);
        setNeedsUsername(false);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [createGuestUserDoc]);

  // Poll for email verification status (focus + interval)
  // Checks both Firebase Auth (user clicked email link) and Firestore (admin toggled it)
  useEffect(() => {
    if (!user || emailVerified) return;

    const isGoogleUser = user.providerData?.some(p => p.providerId === 'google.com');
    if (isGoogleUser) return;

    const checkVerification = async (): Promise<void> => {
      try {
        // Check Firebase Auth (user verified via email link)
        await user.reload();
        if (auth.currentUser?.emailVerified) {
          setEmailVerified(true);
          await updateUserDoc(user.uid, { emailVerified: true });
          setUserDoc(prev => prev ? { ...prev, emailVerified: true } : prev);
          return;
        }

        // Check Firestore (admin may have toggled emailVerified)
        const doc = await getUserDoc(user.uid) as UserDoc | null;
        if (doc?.emailVerified) {
          setEmailVerified(true);
          setUserDoc(prev => prev ? { ...prev, emailVerified: true } : prev);
        }
      } catch (err) {
        console.error('Failed to check verification status:', err);
      }
    };

    const interval = setInterval(checkVerification, 30000);
    window.addEventListener('focus', checkVerification);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkVerification);
    };
  }, [user, emailVerified]);

  /**
   * Send or resend verification email
   */
  const sendVerificationEmailToUser = useCallback(async (): Promise<void> => {
    if (!user) throw new Error('No authenticated user');
    await sendEmailVerification(user);
  }, [user]);

  /**
   * Sign up with email and password
   */
  const signup = useCallback(async (email: string, password: string, username: string): Promise<FirebaseUser> => {
    // Fast pre-check to avoid creating Auth users for obviously-taken usernames.
    const availability = await checkUsernameAvailability(username, null, true);
    if (!availability.available) {
      throw new UsernameTakenError(availability.suggestions || []);
    }

    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error('[signup] Firebase createUserWithEmailAndPassword failed:', err);
      throw err;
    }

    // Send verification email (non-blocking -- signup succeeds even if this fails)
    try {
      await sendEmailVerification(credential.user);
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    try {
      await createUserDoc(credential.user.uid, email, username);
    } catch (err) {
      // If the username was taken due to a race, remove the just-created auth user.
      try {
        await credential.user.delete();
      } catch (deleteErr) {
        console.error('Failed to delete auth user after username conflict:', deleteErr);
      }
      throw err;
    }
    const doc = await getUserDoc(credential.user.uid) as UserDoc | null;
    setUserDoc(doc ? { ...doc, lastActive: new Date() } : doc);
    setNeedsUsername(false);
    return credential.user;
  }, []);

  /**
   * Log in with email and password
   */
  const login = useCallback(async (email: string, password: string): Promise<FirebaseUser> => {
    // If already logged in, don't re-login
    if (auth.currentUser) {
      console.log('[login] Already logged in, skipping');
      return auth.currentUser;
    }
    console.log('[login] Attempting login for:', email);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      console.log('[login] signInWithEmailAndPassword succeeded:', credential.user.uid);
      await touchLastActive(credential.user.uid);
      const doc = await getUserDoc(credential.user.uid) as UserDoc | null;
      console.log('[login] getUserDoc result:', doc ? 'found' : 'not found');
      // Don't set needsUsername here - let onAuthStateChanged handle it to avoid race
      if (doc) {
        setUserDoc({ ...doc, lastActive: new Date() });
      }
      return credential.user;
    } catch (err) {
      console.error('[login] Login failed:', err);
      throw err;
    }
  }, []);

  /**
   * Sign in with Google
   */
  const loginWithGoogle = useCallback(async (): Promise<FirebaseUser> => {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);

    // Check if user already has a Firestore doc
    const existingDoc = await getUserDoc(credential.user.uid) as UserDoc | null;
    if (existingDoc) {
      await touchLastActive(credential.user.uid);
      setUserDoc({ ...existingDoc, lastActive: new Date() });
      setNeedsUsername(false);
    } else {
      // New Google user -- needs to pick a username
      setNeedsUsername(true);
    }

    return credential.user;
  }, []);

  /**
   * Continue without creating an account.
   */
  const continueAsGuest = useCallback(async (): Promise<FirebaseUser> => {
    if (auth.currentUser?.isAnonymous) {
      return auth.currentUser;
    }
    try {
      const credential = await signInAnonymously(auth);
      return credential.user;
    } catch (err) {
      throw err;
    }
  }, []);

  /**
   * Complete sign-up by setting a username (called after sign-in for users without Firestore doc)
   */
  const completeGoogleSignUp = useCallback(async (username: string): Promise<void> => {
    if (!user) throw new Error('No authenticated user');
    console.log('[completeGoogleSignUp] Creating user doc for:', user.uid, 'username:', username);

    const availability = await checkUsernameAvailability(username, user.uid, true);
    if (!availability.available) {
      throw new UsernameTakenError(availability.suggestions || []);
    }

    await createUserDoc(user.uid, user.email!, username);
    console.log('[completeGoogleSignUp] User doc created, fetching...');
    const doc = await getUserDoc(user.uid) as UserDoc | null;
    console.log('[completeGoogleSignUp] getUserDoc result:', doc ? 'found' : 'not found');
    if (doc) {
      setUserDoc({ ...doc, lastActive: new Date() });
    } else {
      console.error('[completeGoogleSignUp] Failed to fetch user doc after creation!');
    }
    setNeedsUsername(false);
  }, [user]);

  /**
   * Log out
   */
  const logout = useCallback(async (): Promise<void> => {
    await signOut(auth);
    setUser(null);
    setUserDoc(null);
    setNeedsUsername(false);
  }, []);

  /**
   * Update username
   */
  const updateUsername = useCallback(async (newUsername: string): Promise<void> => {
    if (!user) throw new Error('No authenticated user');
    // Enforce server-side rules (uniqueness + 30-day cooldown)
    await updateUserProfile(user.uid, { username: newUsername });
    // Refresh local userDoc to pick up serverTimestamp fields like lastUsernameChange
    const doc = await getUserDoc(user.uid) as UserDoc | null;
    if (doc) setUserDoc(doc);
  }, [user]);

  /**
   * Update favorite emote for the current user.
   */
  const updateFavoriteEmote = useCallback(async (favoriteEmote: string): Promise<void> => {
    if (!user) throw new Error('No authenticated user');
    const normalized = normalizeFavoriteEmote(favoriteEmote);
    await updateUserDoc(user.uid, { favoriteEmote: normalized });
    setUserDoc(prev => (prev ? { ...prev, favoriteEmote: normalized } : prev));
  }, [user]);

  /**
   * Upload and persist a profile photo URL for the current user.
   */
  const updateProfileImage = useCallback(async (file: File): Promise<string> => {
    if (!user) throw new Error('No authenticated user');

    // Mirror submission upload flow: compress and store Base64 data URL in Firestore.
    const photoURL = await compressImage(file);

    await updateUserDoc(user.uid, { photoURL });
    setUserDoc(prev => (prev ? { ...prev, photoURL } : prev));

    return photoURL;
  }, [user]);

  /**
   * Re-fetch the user doc from Firestore (e.g. after XP is awarded)
   */
  const refreshUserDoc = useCallback(async (): Promise<void> => {
    if (!user) return;
    const doc = await getUserDoc(user.uid) as UserDoc | null;
    if (doc) setUserDoc(doc);
  }, [user]);

  // Determine admin status: check Firestore doc OR hardcoded admin UID
  const isAdmin: boolean = !!(userDoc?.isAdmin) || (!!user && isHardcodedAdmin(user.uid));

  // Derive permissions: hardcoded admin always has all, other admins get their stored permissions
  const permissions: AdminPermissions = isAdmin
    ? (user && isHardcodedAdmin(user.uid))
      ? getAllPermissions()
      : (userDoc?.permissions || getNoPermissions())
    : getNoPermissions();

  /**
   * Check if the current user has a specific admin permission.
   * @param permission - One of ADMIN_PERMISSIONS values
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!isAdmin) return false;
    if (user && isHardcodedAdmin(user.uid)) return true;
    return !!(permissions[permission]);
  }, [isAdmin, user, permissions]);

  // Derive level info from the user's totalXp
  const totalXp: number = userDoc?.totalXp ?? 0;
  const levelInfo: LevelInfo = getLevelInfo(totalXp);
  const levelTitle: string = getLevelTitle(levelInfo.level);

  const value: AuthContextType = {
    user,
    userDoc,
    loading,
    isGuest,
    needsUsername,
    isAdmin,
    permissions,
    hasPermission,
    totalXp,
    levelInfo,
    levelTitle,
    emailVerified,
    signup,
    login,
    loginWithGoogle,
    continueAsGuest,
    completeGoogleSignUp,
    logout,
    updateUsername,
    updateFavoriteEmote,
    updateProfileImage,
    refreshUserDoc,
    sendVerificationEmail: sendVerificationEmailToUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
