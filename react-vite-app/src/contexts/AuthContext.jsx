import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import { auth } from '../firebase';
import { createUserDoc, getUserDoc, updateUserDoc, isUsernameTaken, isHardcodedAdmin } from '../services/userService';

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

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Fetch the user's Firestore document
        const doc = await getUserDoc(firebaseUser.uid);
        if (doc) {
          setUserDoc(doc);
          setNeedsUsername(false);
        } else {
          // User exists in Auth but not in Firestore (Google sign-in, first time)
          setUserDoc(null);
          setNeedsUsername(true);
        }
      } else {
        setUserDoc(null);
        setNeedsUsername(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

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

  // Determine admin status: check Firestore doc OR hardcoded admin UID
  const isAdmin = !!(userDoc?.isAdmin) || (user && isHardcodedAdmin(user.uid));

  const value = {
    user,
    userDoc,
    loading,
    needsUsername,
    isAdmin,
    signup,
    login,
    loginWithGoogle,
    completeGoogleSignUp,
    logout,
    updateUsername
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
