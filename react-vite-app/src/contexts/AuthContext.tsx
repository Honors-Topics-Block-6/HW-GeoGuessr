import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../firebase';
import { createUserDoc, getUserDoc, updateUserDoc, updateUserProfile, isUsernameTaken, isHardcodedAdmin, getAllPermissions, getNoPermissions, ADMIN_PERMISSIONS } from '../services/userService';
import { getLevelInfo, getLevelTitle } from '../utils/xpLevelling';

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
  isAdmin: boolean;
  emailVerified: boolean;
  totalXp: number;
  gamesPlayed: number;
  createdAt: unknown; // Firestore Timestamp or serverTimestamp sentinel
  permissions?: AdminPermissions;
  lastGameAt?: unknown;
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
  completeGoogleSignUp: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;
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

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      setUser(firebaseUser);
      const authVerified = firebaseUser?.emailVerified ?? false;

      if (firebaseUser) {
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

      setLoading(false);
    });

    return unsubscribe;
  }, []);

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
    // Check username uniqueness before creating account
    const taken = await isUsernameTaken(username);
    if (taken) {
      throw new Error('Username is already taken. Please choose another.');
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);

    // Send verification email (non-blocking -- signup succeeds even if this fails)
    try {
      await sendEmailVerification(credential.user);
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    await createUserDoc(credential.user.uid, email, username);
    const doc = await getUserDoc(credential.user.uid) as UserDoc | null;
    setUserDoc(doc);
    setNeedsUsername(false);
    return credential.user;
  }, []);

  /**
   * Log in with email and password
   */
  const login = useCallback(async (email: string, password: string): Promise<FirebaseUser> => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const doc = await getUserDoc(credential.user.uid) as UserDoc | null;
    setUserDoc(doc);
    return credential.user;
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
      setUserDoc(existingDoc);
      setNeedsUsername(false);
    } else {
      // New Google user -- needs to pick a username
      setNeedsUsername(true);
    }

    return credential.user;
  }, []);

  /**
   * Complete Google sign-in by setting a username (called after Google sign-in for new users)
   */
  const completeGoogleSignUp = useCallback(async (username: string): Promise<void> => {
    if (!user) throw new Error('No authenticated user');

    const taken = await isUsernameTaken(username);
    if (taken) {
      throw new Error('Username is already taken. Please choose another.');
    }

    await createUserDoc(user.uid, user.email!, username);
    const doc = await getUserDoc(user.uid) as UserDoc | null;
    setUserDoc(doc);
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
    completeGoogleSignUp,
    logout,
    updateUsername,
    refreshUserDoc,
    sendVerificationEmail: sendVerificationEmailToUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
