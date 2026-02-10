import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { getAllSampleImages } from './imageService';

const DAILY_GOALS_COLLECTION = 'dailyGoals';
const DAILY_PROGRESS_COLLECTION = 'dailyGoalProgress';

const DEFAULT_GOALS = {
  indoorTarget: 3,
  outdoorTarget: 3
};

/**
 * Format a date into YYYY-MM-DD.
 * Uses local time to align with a "school day" experience.
 * @param {Date|number|string} value
 * @returns {string}
 */
export function getTodayKey(value = new Date()) {
  const now = new Date(value);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultProgress() {
  return {
    indoorCount: 0,
    outdoorCount: 0,
    indoorCompleted: false,
    outdoorCompleted: false,
    firstLocationCompleted: false
  };
}

function normalizeGoalData(raw, dateKey) {
  if (!raw) {
    return {
      date: dateKey,
      indoorTarget: DEFAULT_GOALS.indoorTarget,
      outdoorTarget: DEFAULT_GOALS.outdoorTarget,
      firstLocationId: null,
      firstWinner: null
    };
  }

  return {
    date: raw.date || dateKey,
    indoorTarget: raw.indoorTarget ?? DEFAULT_GOALS.indoorTarget,
    outdoorTarget: raw.outdoorTarget ?? DEFAULT_GOALS.outdoorTarget,
    firstLocationId: raw.firstLocationId || null,
    firstWinner: raw.firstWinner || null
  };
}

function normalizeProgressData(raw) {
  if (!raw) {
    return createDefaultProgress();
  }

  return {
    ...createDefaultProgress(),
    ...raw
  };
}

async function chooseFirstLocationId() {
  try {
    // Pull from Firestore when available, otherwise use sample data
    const imagesSnapshot = await getDocs(collection(db, 'images'));
    let candidates = [];

    if (!imagesSnapshot.empty) {
      candidates = imagesSnapshot.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        .filter(image => image?.environment);
    }

    if (candidates.length === 0) {
      candidates = getAllSampleImages().filter(image => image.environment);
    }

    if (candidates.length === 0) {
      return null;
    }

    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index].id;
  } catch (error) {
    console.error('Failed to choose first-location goal image:', error);
    return null;
  }
}

async function ensureDailyGoalsDoc(dateKey) {
  const docRef = doc(db, DAILY_GOALS_COLLECTION, dateKey);
  const snapshot = await getDoc(docRef);

  if (snapshot.exists()) {
    return normalizeGoalData(snapshot.data(), dateKey);
  }

  const firstLocationId = await chooseFirstLocationId();
  const defaults = {
    date: dateKey,
    indoorTarget: DEFAULT_GOALS.indoorTarget,
    outdoorTarget: DEFAULT_GOALS.outdoorTarget,
    firstLocationId: firstLocationId || null,
    firstWinner: null,
    createdAt: serverTimestamp()
  };

  await setDoc(docRef, defaults);

  return normalizeGoalData(defaults, dateKey);
}

export async function fetchDailyGoals(dateKey = getTodayKey()) {
  return ensureDailyGoalsDoc(dateKey);
}

export function subscribeToDailyGoals(dateKey, callback) {
  const docRef = doc(db, DAILY_GOALS_COLLECTION, dateKey);

  return onSnapshot(
    docRef,
    snapshot => {
      if (snapshot.exists()) {
        callback(normalizeGoalData(snapshot.data(), dateKey));
      } else {
        callback(null);
      }
    },
    error => {
      console.error('Daily goals subscription error:', error);
      callback(null);
    }
  );
}

export async function getUserDailyProgress(playerId, dateKey = getTodayKey()) {
  if (!playerId) {
    throw new Error('playerId is required to load daily progress');
  }

  const docRef = doc(db, DAILY_PROGRESS_COLLECTION, dateKey, 'users', playerId);
  const snapshot = await getDoc(docRef);

  if (snapshot.exists()) {
    return normalizeProgressData(snapshot.data());
  }

  const defaults = {
    ...createDefaultProgress(),
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, defaults);
  return createDefaultProgress();
}

export async function updateUserDailyProgress(playerId, updates, dateKey = getTodayKey()) {
  if (!playerId) {
    throw new Error('playerId is required to update daily progress');
  }

  if (!updates || Object.keys(updates).length === 0) {
    return;
  }

  const docRef = doc(db, DAILY_PROGRESS_COLLECTION, dateKey, 'users', playerId);
  await setDoc(
    docRef,
    {
      ...updates,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function claimFirstLocationWinner(playerId, dateKey = getTodayKey()) {
  if (!playerId) {
    throw new Error('playerId is required to claim first-location goal');
  }

  const goalRef = doc(db, DAILY_GOALS_COLLECTION, dateKey);

  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(goalRef);

    if (!snapshot.exists()) {
      throw new Error('Daily goals document missing');
    }

    const data = snapshot.data();

    if (!data.firstLocationId) {
      return { success: false, reason: 'no-first-location' };
    }

    if (data.firstWinner && data.firstWinner.playerId) {
      return { success: false, alreadyClaimed: true, winner: data.firstWinner };
    }

    transaction.update(goalRef, {
      firstWinner: {
        playerId,
        claimedAt: serverTimestamp()
      }
    });

    return { success: true };
  });
}
