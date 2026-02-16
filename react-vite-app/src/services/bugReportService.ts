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
  serverTimestamp,
  type Timestamp as FirestoreTimestamp,
  type FieldValue
} from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

export type BugReportCategory = 'gameplay' | 'ui' | 'performance' | 'map' | 'multiplayer' | 'other';
export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugReportStatus = 'open' | 'in-progress' | 'resolved' | 'wont-fix' | 'closed';

export interface EnvironmentInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  timestamp: string;
}

export interface AdminNote {
  adminUid: string;
  adminUsername: string;
  note: string;
  createdAt: string;
}

export interface BugReportData {
  userId: string;
  username: string;
  userEmail?: string;
  title: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  description: string;
  stepsToReproduce?: string;
  screenshot?: string | null;
  environment?: EnvironmentInfo | null;
}

export interface BugReportDoc {
  id: string;
  userId: string;
  username: string;
  userEmail: string;
  title: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  description: string;
  stepsToReproduce: string | null;
  screenshot: string | null;
  environment: EnvironmentInfo;
  status: BugReportStatus;
  adminNotes: AdminNote[];
  createdAt: FirestoreTimestamp | FieldValue | null;
  updatedAt: FirestoreTimestamp | FieldValue | null;
}

// ────── Constants ──────

const VALID_CATEGORIES: readonly BugReportCategory[] = ['gameplay', 'ui', 'performance', 'map', 'multiplayer', 'other'];
const VALID_SEVERITIES: readonly BugReportSeverity[] = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES: readonly BugReportStatus[] = ['open', 'in-progress', 'resolved', 'wont-fix', 'closed'];

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const STEPS_MAX_LENGTH = 1000;
const NOTE_MAX_LENGTH = 500;
const RATE_LIMIT_MS = 60_000; // 1 minute between reports per user

// Client-side rate limiting map
const _lastSubmitTimes = new Map<string, number>();

// ────── Helpers ──────

/**
 * Capture the current browser/device environment info.
 */
export function captureEnvironment(): EnvironmentInfo {
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
 */
export async function submitBugReport(reportData: BugReportData): Promise<string> {
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
    status: 'open' as BugReportStatus,
    adminNotes: [] as AdminNote[],
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
 */
export function subscribeToBugReports(callback: (reports: BugReportDoc[]) => void): () => void {
  const reportsRef = collection(db, 'bugReports');
  const q = query(reportsRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as BugReportDoc[];
    callback(reports);
  }, () => {
    // Fallback if composite index not yet created
    const fallbackQ = query(reportsRef);
    return onSnapshot(fallbackQ, (snapshot) => {
      const reports = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as BugReportDoc[];
      // Sort client-side
      reports.sort((a, b) => {
        const aTime = (a.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
        const bTime = (b.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(reports);
    });
  });
}

/**
 * Get all bug reports submitted by a specific user.
 */
export async function getBugReportsByUser(userId: string): Promise<BugReportDoc[]> {
  if (!userId) return [];

  const reportsRef = collection(db, 'bugReports');

  try {
    const q = query(reportsRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as BugReportDoc[];
  } catch {
    // Fallback without ordering (index may not exist)
    const q = query(reportsRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const reports = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as BugReportDoc[];
    reports.sort((a, b) => {
      const aTime = (a.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
      const bTime = (b.createdAt as FirestoreTimestamp | null)?.toMillis?.() || 0;
      return bTime - aTime;
    });
    return reports;
  }
}

/**
 * Update the status of a bug report (admin action).
 */
export async function updateBugReportStatus(
  reportId: string,
  newStatus: BugReportStatus,
  adminUid: string,
  _adminUsername: string
): Promise<void> {
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
 */
export async function addAdminNote(
  reportId: string,
  adminUid: string,
  adminUsername: string,
  noteText: string
): Promise<void> {
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

  const currentNotes: AdminNote[] = reportSnap.data().adminNotes || [];
  const newNote: AdminNote = {
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
