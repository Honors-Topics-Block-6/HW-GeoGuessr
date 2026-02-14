import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendEmailVerification
} from 'firebase/auth';
import { auth } from '../firebase';
import { createUserDoc, getUserDoc, updateUserDoc, isUsernameTaken, isHardcodedAdmin } from '../services/userService';
import { getLevelInfo, getLevelTitle } from '../utils/xpLevelling';

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);         // Firebase Auth user
  const [userDoc, setUserDoc] = useState(null);    // Firestore user document
  const [loading, setLoading] = useState(true);    // Initial auth check loading
  const [needsUsername, setNeedsUsername] = useState(false); // Google sign-in needs username
  const [emailVerified, setEmailVerified] = useState(false); // Email verification status

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      const authVerified = firebaseUser?.emailVerified ?? false;

      if (firebaseUser) {
        // Fetch the user's Firestore document
        const doc = await getUserDoc(firebaseUser.uid);
        if (doc) {
          // Verified if either Firebase Auth or Firestore says so
          // (admin can set emailVerified in Firestore, user can verify via email link)
          const isVerified = authVerified || doc.emailVerified === true;
          setEmailVerified(isVerified);

          // Sync Firebase Auth → Firestore when user verifies via email link
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

    const checkVerification = async () => {
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
        const doc = await getUserDoc(user.uid);
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
  const sendVerificationEmailToUser = useCallback(async () => {
    if (!user) throw new Error('No authenticated user');
    await sendEmailVerification(user);
  }, [user]);

  /**
   * Sign up with email and password
   */
  const signup = useCallback(async (email, password, username) => {
    // Check username uniqueness before creating account
    const taken = await isUsernameTaken(username);
    if (taken) {
      throw new Error('Username is already taken. Please choose another.');
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);

    // Send verification email (non-blocking — signup succeeds even if this fails)
    try {
      await sendEmailVerification(credential.user);
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    await createUserDoc(credential.user.uid, email, username);
    const doc = await getUserDoc(credential.user.uid);
    setUserDoc(doc);
    setNeedsUsername(false);
    return credential.user;
  }, []);

  /**
   * Log in with email and password
   */
  const login = useCallback(async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const doc = await getUserDoc(credential.user.uid);
    setUserDoc(doc);
    return credential.user;
  }, []);

  /**
   * Sign in with Google
   */
  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);

    // Check if user already has a Firestore doc
    const existingDoc = await getUserDoc(credential.user.uid);
    if (existingDoc) {
      setUserDoc(existingDoc);
      setNeedsUsername(false);
    } else {
      // New Google user — needs to pick a username
      setNeedsUsername(true);
    }

    return credential.user;
  }, []);

  /**
   * Complete Google sign-in by setting a username (called after Google sign-in for new users)
   */
  const completeGoogleSignUp = useCallback(async (username) => {
    if (!user) throw new Error('No authenticated user');

    const taken = await isUsernameTaken(username);
    if (taken) {
      throw new Error('Username is already taken. Please choose another.');
    }

    await createUserDoc(user.uid, user.email, username);
    const doc = await getUserDoc(user.uid);
    setUserDoc(doc);
    setNeedsUsername(false);
  }, [user]);

  /**
   * Log out
   */
  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setUserDoc(null);
    setNeedsUsername(false);
  }, []);

  /**
   * Update username
   */
  const updateUsername = useCallback(async (newUsername) => {
    if (!user) throw new Error('No authenticated user');

    const taken = await isUsernameTaken(newUsername, user.uid);
    if (taken) {
      throw new Error('Username is already taken. Please choose another.');
    }

    await updateUserDoc(user.uid, { username: newUsername });
    setUserDoc(prev => ({ ...prev, username: newUsername }));
  }, [user]);

  /**
   * Re-fetch the user doc from Firestore (e.g. after XP is awarded)
   */
  const refreshUserDoc = useCallback(async () => {
    if (!user) return;
    const doc = await getUserDoc(user.uid);
    if (doc) setUserDoc(doc);
  }, [user]);

  // Determine admin status: check Firestore doc OR hardcoded admin UID
  const isAdmin = !!(userDoc?.isAdmin) || (user && isHardcodedAdmin(user.uid));

  // Derive level info from the user's totalXp
  const totalXp = userDoc?.totalXp ?? 0;
  const levelInfo = getLevelInfo(totalXp);
  const levelTitle = getLevelTitle(levelInfo.level);

  const value = {
    user,
    userDoc,
    loading,
    needsUsername,
    isAdmin,
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
