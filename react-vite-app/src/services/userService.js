import { db } from '../firebase';
import {
  doc,
  collection,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

/**
 * Save a game result for a user
 * @param {string} userId - The user's ID
 * @param {object} gameResult - The game result to save
 * @returns {Promise<string>} The ID of the saved result
 */
export async function saveGameResult(userId, gameResult) {
  if (!userId) {
    console.warn('Cannot save game result: no user ID provided');
    return null;
  }

  try {
    const userGamesRef = collection(db, 'users', userId, 'games');
    const docRef = await addDoc(userGamesRef, {
      ...gameResult,
      playedAt: serverTimestamp()
    });
    
    // Update user stats
    await updateUserStats(userId, gameResult.totalScore);
    
    return docRef.id;
  } catch (error) {
    console.error('Error saving game result:', error);
    throw error;
  }
}

/**
 * Update user statistics after a game
 * @param {string} userId - The user's ID
 * @param {number} score - The score from the game
 */
async function updateUserStats(userId, score) {
  const userRef = doc(db, 'users', userId);
  
  try {
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      const newGamesPlayed = (data.gamesPlayed || 0) + 1;
      const newTotalScore = (data.totalScore || 0) + score;
      const newHighScore = Math.max(data.highScore || 0, score);
      
      await setDoc(userRef, {
        ...data,
        gamesPlayed: newGamesPlayed,
        totalScore: newTotalScore,
        highScore: newHighScore,
        averageScore: Math.round(newTotalScore / newGamesPlayed),
        lastPlayed: serverTimestamp()
      }, { merge: true });
    } else {
      // Create new user stats document
      await setDoc(userRef, {
        gamesPlayed: 1,
        totalScore: score,
        highScore: score,
        averageScore: score,
        lastPlayed: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

/**
 * Get user statistics
 * @param {string} userId - The user's ID
 * @returns {Promise<object|null>} User stats or null
 */
export async function getUserStats(userId) {
  if (!userId) return null;
  
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error('Error getting user stats:', error);
    return null;
  }
}

/**
 * Get recent games for a user
 * @param {string} userId - The user's ID
 * @param {number} count - Number of games to retrieve
 * @returns {Promise<Array>} Array of game results
 */
export async function getRecentGames(userId, count = 10) {
  if (!userId) return [];
  
  try {
    const userGamesRef = collection(db, 'users', userId, 'games');
    const q = query(userGamesRef, orderBy('playedAt', 'desc'), limit(count));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting recent games:', error);
    return [];
  }
}

