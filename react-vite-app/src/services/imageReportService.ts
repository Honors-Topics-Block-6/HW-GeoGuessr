import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Timestamp as FirestoreTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export type ImageReportCause = 'wrong_location' | 'inappropriate' | 'other';

export interface ImageReportPayload {
  cause: ImageReportCause;
  explanation: string;
  suggestedLocation?: { x: number; y: number } | null;
  suggestedFloor?: number | null;
}

export interface ImageReportData {
  imageId: string | null;
  imageUrl?: string | null;
  userId: string;
  username: string;
  userEmail?: string;
  cause: ImageReportCause;
  explanation: string;
  suggestedLocation?: { x: number; y: number } | null;
  suggestedFloor?: number | null;
}

const RATE_LIMIT_MS = 60_000; // 1 minute between reports per user
const _lastSubmitTimes = new Map<string, number>();

/**
 * Submit a report for an inaccurate image.
 * Stores in Firestore for admin review.
 */
export async function submitImageReport(reportData: ImageReportData): Promise<string> {
  const { imageId, imageUrl, userId, username, userEmail, cause, explanation, suggestedLocation, suggestedFloor } = reportData;

  if (!userId) throw new Error('User ID is required.');
  if (!username) throw new Error('Username is required.');
  if (!imageId && !imageUrl) {
    throw new Error('Either image ID or image URL is required to report.');
  }
  const trimmed = (explanation || '').trim();
  if (!trimmed) throw new Error('Explanation is required.');

  const now = Date.now();
  const lastSubmit = _lastSubmitTimes.get(userId);
  if (lastSubmit && now - lastSubmit < RATE_LIMIT_MS) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (now - lastSubmit)) / 1000);
    throw new Error(`Please wait ${remaining} seconds before submitting another report.`);
  }

  // Prevent duplicate reports: same user cannot report the same image twice
  const reportsRef = collection(db, 'imageReports');
  const userReportsQuery = query(reportsRef, where('userId', '==', userId));
  const existingSnap = await getDocs(userReportsQuery);
  const alreadyReported = existingSnap.docs.some((docSnap) => {
    const d = docSnap.data();
    if (imageId && d.imageId === imageId) return true;
    if (imageUrl && d.imageUrl === imageUrl) return true;
    return false;
  });
  if (alreadyReported) {
    throw new Error('You have already reported this image.');
  }

  const docRef = await addDoc(collection(db, 'imageReports'), {
    imageId: imageId ?? null,
    imageUrl: imageUrl ?? null,
    userId,
    username,
    userEmail: userEmail ?? '',
    cause,
    explanation: trimmed,
    suggestedLocation: suggestedLocation ?? null,
    suggestedFloor: suggestedFloor ?? null,
    createdAt: serverTimestamp()
  });

  _lastSubmitTimes.set(userId, Date.now());
  return docRef.id;
}

/**
 * Check if a user has already reported a specific image.
 * Used to grey out the Report Image button on the result screen.
 */
export async function hasUserReportedImage(
  userId: string,
  imageId: string | null,
  imageUrl?: string | null
): Promise<boolean> {
  if (!userId || (!imageId && !imageUrl)) return false;
  const reportsRef = collection(db, 'imageReports');
  const userReportsQuery = query(reportsRef, where('userId', '==', userId));
  const existingSnap = await getDocs(userReportsQuery);
  return existingSnap.docs.some((docSnap) => {
    const d = docSnap.data();
    if (imageId && d.imageId === imageId) return true;
    if (imageUrl && d.imageUrl === imageUrl) return true;
    return false;
  });
}

export interface ImageReportDoc {
  id: string;
  imageId: string | null;
  imageUrl: string | null;
  userId: string;
  username: string;
  userEmail: string;
  cause: ImageReportCause;
  explanation: string;
  suggestedLocation?: { x: number; y: number } | null;
  suggestedFloor?: number | null;
  createdAt: FirestoreTimestamp | null;
}

const CAUSE_LABELS: Record<ImageReportCause, string> = {
  wrong_location: 'Wrong location',
  inappropriate: 'Inappropriate',
  other: 'Other',
};

export { CAUSE_LABELS };

/**
 * Subscribe to all image reports in real-time (admin use).
 * Returns an unsubscribe function.
 */
export function subscribeToImageReports(
  callback: (reports: ImageReportDoc[]) => void
): () => void {
  const reportsRef = collection(db, 'imageReports');

  try {
    const q = query(reportsRef, orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ImageReportDoc[];
      callback(reports);
    });
  } catch {
    const fallbackQ = query(reportsRef);
    return onSnapshot(fallbackQ, (snapshot) => {
      const reports = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ImageReportDoc[];
      reports.sort((a, b) => {
        const aTime = (a.createdAt as FirestoreTimestamp | null)?.toMillis?.() ?? 0;
        const bTime = (b.createdAt as FirestoreTimestamp | null)?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      callback(reports);
    });
  }
}
