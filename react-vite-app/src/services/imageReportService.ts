import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
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
