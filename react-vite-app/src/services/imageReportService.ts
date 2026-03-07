import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface ImageReportData {
  imageId: string | null;
  imageUrl?: string | null;
  userId: string;
  username: string;
  userEmail?: string;
}

const RATE_LIMIT_MS = 60_000; // 1 minute between reports per user
const _lastSubmitTimes = new Map<string, number>();

/**
 * Submit a report for an inaccurate image (wrong location, etc.).
 * Stores in Firestore for admin review.
 */
export async function submitImageReport(reportData: ImageReportData): Promise<string> {
  const { imageId, imageUrl, userId, username, userEmail } = reportData;

  if (!userId) throw new Error('User ID is required.');
  if (!username) throw new Error('Username is required.');
  if (!imageId && !imageUrl) {
    throw new Error('Either image ID or image URL is required to report.');
  }

  const now = Date.now();
  const lastSubmit = _lastSubmitTimes.get(userId);
  if (lastSubmit && now - lastSubmit < RATE_LIMIT_MS) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (now - lastSubmit)) / 1000);
    throw new Error(`Please wait ${remaining} seconds before submitting another report.`);
  }

  const docRef = await addDoc(collection(db, 'imageReports'), {
    imageId: imageId ?? null,
    imageUrl: imageUrl ?? null,
    userId,
    username,
    userEmail: userEmail ?? '',
    createdAt: serverTimestamp()
  });

  _lastSubmitTimes.set(userId, Date.now());
  return docRef.id;
}
