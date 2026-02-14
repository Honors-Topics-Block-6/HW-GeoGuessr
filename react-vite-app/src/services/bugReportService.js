import {
  addDoc,
  updateDoc,
  getDoc,
  doc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

// ────── Constants ──────

const VALID_CATEGORIES = ['gameplay', 'ui', 'performance', 'map', 'multiplayer', 'other'];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES = ['open', 'in-progress', 'resolved', 'wont-fix', 'closed'];

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const STEPS_MAX_LENGTH = 1000;
const NOTE_MAX_LENGTH = 500;
const RATE_LIMIT_MS = 60_000; // 1 minute between reports per user

// Client-side rate limiting map
const _lastSubmitTimes = new Map();

// ────── Helpers ──────

/**
 * Capture the current browser/device environment info.
 * @returns {object} Environment data
 */
export function captureEnvironment() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    timestamp: new Date().toISOString()
  };
}

// ────── Bug Report CRUD ──────

/**
 * Submit a new bug report.
 * Validates required fields and enforces rate limiting.
 *
 * @param {object} reportData
 * @param {string} reportData.userId - Firebase Auth UID
 * @param {string} reportData.username - Display name
 * @param {string} reportData.userEmail - Email
 * @param {string} reportData.title - Bug title (max 100 chars)
 * @param {string} reportData.category - One of VALID_CATEGORIES
 * @param {string} reportData.severity - One of VALID_SEVERITIES
 * @param {string} reportData.description - Detailed description (max 2000 chars)
 * @param {string} [reportData.stepsToReproduce] - Steps to reproduce (max 1000 chars)
 * @param {string|null} [reportData.screenshot] - Base64 compressed image or null
 * @param {object} [reportData.environment] - Browser/device info from captureEnvironment()
 * @returns {Promise<string>} The new document ID
 */
export async function submitBugReport(reportData) {
  const {
    userId,
    username,
    userEmail,
    title,
    category,
    severity,
    description,
    stepsToReproduce = '',
    screenshot = null,
    environment = null
  } = reportData;

  // ── Validation ──
  if (!userId) throw new Error('User ID is required.');
  if (!username) throw new Error('Username is required.');

  const trimmedTitle = (title || '').trim();
  if (!trimmedTitle) throw new Error('Title is required.');
  if (trimmedTitle.length > TITLE_MAX_LENGTH) {
    throw new Error(`Title must be ${TITLE_MAX_LENGTH} characters or less.`);
  }

  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error('Please select a valid category.');
  }

  if (!VALID_SEVERITIES.includes(severity)) {
    throw new Error('Please select a valid severity level.');
  }

  const trimmedDescription = (description || '').trim();
  if (!trimmedDescription) throw new Error('Description is required.');
  if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Description must be ${DESCRIPTION_MAX_LENGTH} characters or less.`);
  }

  const trimmedSteps = (stepsToReproduce || '').trim();
  if (trimmedSteps.length > STEPS_MAX_LENGTH) {
    throw new Error(`Steps to reproduce must be ${STEPS_MAX_LENGTH} characters or less.`);
  }

  // ── Rate limiting ──
  const now = Date.now();
  const lastSubmit = _lastSubmitTimes.get(userId);
  if (lastSubmit && now - lastSubmit < RATE_LIMIT_MS) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (now - lastSubmit)) / 1000);
    throw new Error(`Please wait ${remaining} seconds before submitting another report.`);
  }

  // ── Create document ──
  const docRef = await addDoc(collection(db, 'bugReports'), {
    userId,
    username,
    userEmail: userEmail || '',
    title: trimmedTitle,
    category,
    severity,
    description: trimmedDescription,
    stepsToReproduce: trimmedSteps || null,
    screenshot: screenshot || null,
    environment: environment || captureEnvironment(),
    status: 'open',
    adminNotes: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // Update rate limit tracker
  _lastSubmitTimes.set(userId, Date.now());

  return docRef.id;
}

/**
 * Subscribe to all bug reports in real-time (admin use).
 * Returns an unsubscribe function.
 *
 * @param {function} callback - Called with array of report objects
 * @returns {function} Unsubscribe function
 */
export function subscribeToBugReports(callback) {
  const reportsRef = collection(db, 'bugReports');
  const q = query(reportsRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(reports);
  }, () => {
    // Fallback if composite index not yet created
    const fallbackQ = query(reportsRef);
    return onSnapshot(fallbackQ, (snapshot) => {
      const reports = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      // Sort client-side
      reports.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(reports);
    });
  });
}

/**
 * Get all bug reports submitted by a specific user.
 *
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<object[]>} Array of report objects
 */
export async function getBugReportsByUser(userId) {
  if (!userId) return [];

  const reportsRef = collection(db, 'bugReports');

  try {
    const q = query(reportsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch {
    // Fallback without ordering (index may not exist)
    const q = query(reportsRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const reports = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    reports.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    return reports;
  }
}

/**
 * Update the status of a bug report (admin action).
 *
 * @param {string} reportId - Document ID
 * @param {string} newStatus - One of VALID_STATUSES
 * @param {string} adminUid - Admin's UID
 * @param {string} adminUsername - Admin's username
 */
export async function updateBugReportStatus(reportId, newStatus, adminUid, _adminUsername) {
  if (!reportId) throw new Error('Report ID is required.');
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error('Invalid status value.');
  }
  if (!adminUid) throw new Error('Admin UID is required.');

  const reportRef = doc(db, 'bugReports', reportId);
  await updateDoc(reportRef, {
    status: newStatus,
    updatedAt: serverTimestamp()
  });
}

/**
 * Add an admin note to a bug report.
 *
 * @param {string} reportId - Document ID
 * @param {string} adminUid - Admin's UID
 * @param {string} adminUsername - Admin's username
 * @param {string} noteText - Note content
 */
export async function addAdminNote(reportId, adminUid, adminUsername, noteText) {
  if (!reportId) throw new Error('Report ID is required.');
  if (!adminUid) throw new Error('Admin UID is required.');

  const trimmedNote = (noteText || '').trim();
  if (!trimmedNote) throw new Error('Note cannot be empty.');
  if (trimmedNote.length > NOTE_MAX_LENGTH) {
    throw new Error(`Note must be ${NOTE_MAX_LENGTH} characters or less.`);
  }

  // Fetch current notes, append, and update
  const reportRef = doc(db, 'bugReports', reportId);
  const reportSnap = await getDoc(reportRef);

  if (!reportSnap.exists()) {
    throw new Error('Bug report not found.');
  }

  const currentNotes = reportSnap.data().adminNotes || [];
  const newNote = {
    adminUid,
    adminUsername: adminUsername || 'Admin',
    note: trimmedNote,
    createdAt: new Date().toISOString()
  };

  await updateDoc(reportRef, {
    adminNotes: [...currentNotes, newNote],
    updatedAt: serverTimestamp()
  });
}

// ────── Exports for constants (useful for components) ──────

export { VALID_CATEGORIES, VALID_SEVERITIES, VALID_STATUSES };
