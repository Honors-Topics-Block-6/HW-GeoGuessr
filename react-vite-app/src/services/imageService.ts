import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAt,
  startAfter,
  deleteDoc,
  doc,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ImagePoolEntry } from './imagePoolService';

// ────── Types ──────

export interface GameImage {
  id: string;
  url: string;
  correctLocation: { x: number; y: number };
  correctFloor: number | null;
  difficulty: string | null;
  buildingName?: string | null;
  description?: string | null;
}

export interface SampleImage {
  id: string;
  url: string;
  correctLocation: { x: number; y: number };
  correctFloor: number;
  difficulty: string;
  description: string;
}

export interface RandomImageOptions {
  excludeImageIds?: string[];
  excludeImageUrls?: string[];
}

export interface AdminSourceCounts {
  images: number;
  submissions: number;
  pending: number;
  approved: number;
  denied: number;
}

export interface AdminSubmissionPageItem {
  id: string;
  photoURL: string | null;
  location: { x: number; y: number } | null;
  floor: number | null;
  difficulty: string | null;
  photoName: string | null;
  buildingName: string | null;
  description: string | null;
  status: string;
  createdAt: unknown;
  reviewedAt: unknown;
}

export interface AdminImagePageItem {
  id: string;
  url: string | null;
  correctLocation: { x: number; y: number } | null;
  correctFloor: number | null;
  difficulty: string | null;
  description: string | null;
}

export interface AdminPageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

const ADMIN_SOURCE_COUNTS_TTL_MS = 60_000;
let adminSourceCountsCache: { value: AdminSourceCounts; expiresAtMs: number } | null = null;
let adminSourceCountsInFlight: Promise<AdminSourceCounts> | null = null;
const ADMIN_SOURCE_COUNTS_BACKOFF_KEY = 'admin.sourceCounts.backoffUntilMs';
const ADMIN_SOURCE_COUNTS_ERROR_BACKOFF_MS = 5 * 60_000;
const ADMIN_COUNTS_DEBUG_RUN_ID = `admin-counts-${Date.now()}`;

function readCountsBackoffUntilMs(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(ADMIN_SOURCE_COUNTS_BACKOFF_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeCountsBackoffUntilMs(value: number): void {
  if (typeof window === 'undefined') return;
  if (value <= 0) {
    window.localStorage.removeItem(ADMIN_SOURCE_COUNTS_BACKOFF_KEY);
    return;
  }
  window.localStorage.setItem(ADMIN_SOURCE_COUNTS_BACKOFF_KEY, String(value));
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const code = typeof maybe.code === 'string' ? maybe.code.toLowerCase() : '';
  const message = typeof maybe.message === 'string' ? maybe.message.toLowerCase() : '';
  return code.includes('resource-exhausted') || message.includes('quota exceeded');
}

// ────── Constants ──────

// Sample images for development/testing
const SAMPLE_IMAGES: readonly SampleImage[] = [
  {
    id: 'sample-1',
    url: 'https://images.unsplash.com/photo-1562774053-701939374585?w=800&q=80',
    correctLocation: { x: 35, y: 45 },
    correctFloor: 2,
    difficulty: 'easy',
    description: 'Main hallway near the library'
  },
  {
    id: 'sample-2',
    url: 'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?w=800&q=80',
    correctLocation: { x: 65, y: 30 },
    correctFloor: 1,
    difficulty: 'medium',
    description: 'Science building entrance'
  },
  {
    id: 'sample-3',
    url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&q=80',
    correctLocation: { x: 80, y: 60 },
    correctFloor: 1,
    difficulty: 'hard',
    description: 'Gymnasium interior'
  },
  {
    id: 'sample-4',
    url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&q=80',
    correctLocation: { x: 25, y: 75 },
    correctFloor: 3,
    difficulty: 'easy',
    description: 'Arts center studio'
  },
  {
    id: 'sample-5',
    url: 'https://images.unsplash.com/photo-1519452635265-7b1fbfd1e4e0?w=800&q=80',
    correctLocation: { x: 50, y: 50 },
    correctFloor: 2,
    difficulty: 'medium',
    description: 'Outdoor courtyard view'
  }
];

const RANDOM_SELECTION_ATTEMPTS = 8;

function toPoolCandidate(id: string, data: ImagePoolEntry): { id: string; sourceType: 'image' | 'submission'; sourceId: string; difficulty: string | null } | null {
  if (!data?.active) return null;
  if (!data.sourceId || !data.sourceType) return null;
  if (data.sourceType !== 'image' && data.sourceType !== 'submission') return null;
  return {
    id,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    difficulty: data.difficulty ?? null
  };
}

function randomKey(): number {
  return Math.random();
}

async function pickPoolCandidate(difficulty: string | null): Promise<{ id: string; sourceType: 'image' | 'submission'; sourceId: string; difficulty: string | null } | null> {
  const pivot = randomKey();
  const withDifficulty = Boolean(difficulty && difficulty !== 'all');

  let snap;
  try {
    const q1 = query(
      collection(db, 'imagePool'),
      orderBy('randomKey'),
      startAt(pivot),
      limit(1)
    );
    snap = await getDocs(q1);
  } catch (err) {
    throw err;
  }
  if (snap.empty) {
    try {
      const q2 = query(
        collection(db, 'imagePool'),
        orderBy('randomKey'),
        limit(1)
      );
      snap = await getDocs(q2);
    } catch (err) {
      throw err;
    }
  }
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return toPoolCandidate(docSnap.id, docSnap.data() as ImagePoolEntry);
}

async function hydrateCandidate(candidate: { id: string; sourceType: 'image' | 'submission'; sourceId: string }): Promise<GameImage | null> {
  const sourceCollection = candidate.sourceType === 'image' ? 'images' : 'submissions';
  const sourceSnap = await getDoc(doc(db, sourceCollection, candidate.sourceId));
  if (!sourceSnap.exists()) return null;

  const data = sourceSnap.data() as Record<string, unknown>;
  if (candidate.sourceType === 'image') {
    if (typeof data.url !== 'string' || !data.url) return null;
    const loc = data.correctLocation as { x?: unknown; y?: unknown } | undefined;
    if (!loc || typeof loc.x !== 'number' || typeof loc.y !== 'number') return null;
    return {
      id: candidate.id,
      url: data.url,
      correctLocation: { x: loc.x, y: loc.y },
      correctFloor: typeof data.correctFloor === 'number' ? data.correctFloor : null,
      difficulty: typeof data.difficulty === 'string' ? data.difficulty : null,
      buildingName: typeof data.buildingName === 'string' ? data.buildingName : (typeof data.building === 'string' ? data.building : null),
      description: typeof data.description === 'string' ? data.description : null
    };
  }

  if ((data.status as string | undefined) !== 'approved') return null;
  if (typeof data.photoURL !== 'string' || !data.photoURL) return null;
  const loc = data.location as { x?: unknown; y?: unknown } | undefined;
  if (!loc || typeof loc.x !== 'number' || typeof loc.y !== 'number') return null;
  return {
    id: candidate.id,
    url: data.photoURL,
    correctLocation: { x: loc.x, y: loc.y },
    correctFloor: typeof data.floor === 'number' ? data.floor : null,
    difficulty: typeof data.difficulty === 'string' ? data.difficulty : null,
    buildingName: typeof data.buildingName === 'string' ? data.buildingName : (typeof data.building === 'string' ? data.building : null),
    description: typeof data.description === 'string' ? data.description : null
  };
}

async function selectRandomHydratedImage(
  difficulty: string | null,
  excludedIds: Set<string>,
  excludedUrls: Set<string>,
  allowExclusions: boolean
): Promise<GameImage | null> {
  const attemptedCandidateIds = new Set<string>();
  const requiresDifficulty = Boolean(difficulty && difficulty !== 'all');

  for (let attempt = 0; attempt < RANDOM_SELECTION_ATTEMPTS; attempt += 1) {
    const candidate = await pickPoolCandidate(difficulty);
    if (!candidate) return null;
    if (attemptedCandidateIds.has(candidate.id)) {
      continue;
    }
    attemptedCandidateIds.add(candidate.id);
    if (requiresDifficulty && candidate.difficulty !== difficulty) {
      continue;
    }
    if (allowExclusions && excludedIds.has(candidate.id)) {
      continue;
    }

    const hydrated = await hydrateCandidate(candidate);
    if (!hydrated) {
      continue;
    }
    if (allowExclusions && excludedUrls.has(hydrated.url)) {
      continue;
    }

    return hydrated;
  }

  return null;
}

// ────── Functions ──────

/**
 * Fetches a random image from all approved sources, optionally filtered by difficulty.
 * - Firestore 'images' collection (all are considered approved)
 * - Firestore 'submissions' collection with status 'approved'
 */
export async function getRandomImage(
  difficulty: string | null = null,
  options: RandomImageOptions = {}
): Promise<GameImage | null> {
  const startMs = Date.now();
  try {
    const excludedIds = new Set(options.excludeImageIds || []);
    const excludedUrls = new Set(options.excludeImageUrls || []);
    const withExclusion = await selectRandomHydratedImage(difficulty, excludedIds, excludedUrls, true);
    if (withExclusion) {
      console.info(`[getRandomImage] selected in ${Date.now() - startMs}ms (with exclusions)`);
      return withExclusion;
    }
    const fallback = await selectRandomHydratedImage(difficulty, excludedIds, excludedUrls, false);
    console.info(`[getRandomImage] selected in ${Date.now() - startMs}ms (fallback=${fallback ? 'hit' : 'miss'})`);
    return fallback;
  } catch (error) {
    console.error('Error fetching random image:', error);
    return null;
  }
}

/**
 * Fetches all approved images from both the images collection
 * and approved submissions, optionally filtered by difficulty.
 */
export async function getAllApprovedImages(difficulty: string | null = null): Promise<GameImage[]> {
  try {
    const imagesRef = collection(db, 'images');
    const submissionsRef = collection(db, 'submissions');
    const [imagesSnapshot, approvedSubmissionsSnapshot] = await Promise.all([
      getDocs(imagesRef),
      getDocs(query(submissionsRef, where('status', '==', 'approved')))
    ]);

    const images = imagesSnapshot.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const loc = data.correctLocation as { x?: unknown; y?: unknown } | undefined;
      if (typeof data.url !== 'string' || !data.url || !loc || typeof loc.x !== 'number' || typeof loc.y !== 'number') {
        return null;
      }
      return {
        id: docSnap.id,
        url: data.url,
        correctLocation: { x: loc.x, y: loc.y },
        correctFloor: typeof data.correctFloor === 'number' ? data.correctFloor : null,
        difficulty: typeof data.difficulty === 'string' ? data.difficulty : null,
        buildingName: typeof data.buildingName === 'string' ? data.buildingName : null,
        description: typeof data.description === 'string' ? data.description : null
      } as GameImage;
    }).filter((img): img is GameImage => img !== null);

    const submissions = approvedSubmissionsSnapshot.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const loc = data.location as { x?: unknown; y?: unknown } | undefined;
      if (typeof data.photoURL !== 'string' || !data.photoURL || !loc || typeof loc.x !== 'number' || typeof loc.y !== 'number') {
        return null;
      }
      return {
        id: docSnap.id,
        url: data.photoURL,
        correctLocation: { x: loc.x, y: loc.y },
        correctFloor: typeof data.floor === 'number' ? data.floor : null,
        difficulty: typeof data.difficulty === 'string' ? data.difficulty : null,
        buildingName: typeof data.buildingName === 'string' ? data.buildingName : null,
        description: typeof data.description === 'string' ? data.description : null
      } as GameImage;
    }).filter((img): img is GameImage => img !== null);

    const all = [...images, ...submissions];
    if (!difficulty || difficulty === 'all') return all;
    const filtered = all.filter((img) => img.difficulty === difficulty);
    return filtered.length > 0 ? filtered : all;
  } catch (error) {
    console.error('Error fetching approved images:', error);
    return [];
  }
}

function parseLocation(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const maybe = value as { x?: unknown; y?: unknown };
  if (typeof maybe.x !== 'number' || typeof maybe.y !== 'number') return null;
  return { x: maybe.x, y: maybe.y };
}

/**
 * Fetch lightweight source/status counts for admin tabs.
 */
export async function getAdminSourceCounts(): Promise<AdminSourceCounts> {
  const now = Date.now();
  const fallbackCounts: AdminSourceCounts = adminSourceCountsCache?.value ?? {
    images: 0,
    submissions: 0,
    pending: 0,
    approved: 0,
    denied: 0
  };

  const backoffUntilMs = readCountsBackoffUntilMs();
  // #region agent log
  fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_COUNTS_DEBUG_RUN_ID,hypothesisId:'H2',location:'imageService.ts:getAdminSourceCounts:entry',message:'count fetch entry',data:{now,backoffUntilMs,hasCache:Boolean(adminSourceCountsCache),hasInFlight:Boolean(adminSourceCountsInFlight)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (backoffUntilMs > now) {
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_COUNTS_DEBUG_RUN_ID,hypothesisId:'H2',location:'imageService.ts:getAdminSourceCounts:backoff',message:'returning backoff fallback',data:{backoffUntilMs,now},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return fallbackCounts;
  }

  if (adminSourceCountsCache && adminSourceCountsCache.expiresAtMs > now) {
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_COUNTS_DEBUG_RUN_ID,hypothesisId:'H2',location:'imageService.ts:getAdminSourceCounts:cacheHit',message:'returning cached counts',data:{expiresAtMs:adminSourceCountsCache.expiresAtMs,now},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return adminSourceCountsCache.value;
  }
  if (adminSourceCountsInFlight) {
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_COUNTS_DEBUG_RUN_ID,hypothesisId:'H3',location:'imageService.ts:getAdminSourceCounts:inFlight',message:'reusing in-flight counts promise',data:{now},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return adminSourceCountsInFlight;
  }

  const imagesRef = collection(db, 'images');
  const submissionsRef = collection(db, 'submissions');
  // #region agent log
  fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_COUNTS_DEBUG_RUN_ID,hypothesisId:'H1',location:'imageService.ts:getAdminSourceCounts:queryStart',message:'starting aggregation query batch',data:{now},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  adminSourceCountsInFlight = Promise.all([
    getCountFromServer(imagesRef),
    getCountFromServer(submissionsRef),
    getCountFromServer(query(submissionsRef, where('status', '==', 'pending'))),
    getCountFromServer(query(submissionsRef, where('status', '==', 'approved'))),
    getCountFromServer(query(submissionsRef, where('status', '==', 'denied')))
  ]).then(([imagesCount, submissionsCount, pendingCount, approvedCount, deniedCount]) => {
    const value: AdminSourceCounts = {
      images: imagesCount.data().count,
      submissions: submissionsCount.data().count,
      pending: pendingCount.data().count,
      approved: approvedCount.data().count,
      denied: deniedCount.data().count
    };
    adminSourceCountsCache = {
      value,
      expiresAtMs: Date.now() + ADMIN_SOURCE_COUNTS_TTL_MS
    };
    writeCountsBackoffUntilMs(0);
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_COUNTS_DEBUG_RUN_ID,hypothesisId:'H2',location:'imageService.ts:getAdminSourceCounts:success',message:'aggregation query batch succeeded',data:value,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return value;
  }).catch((error) => {
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/139b68f9-a809-4009-b8bd-ff9cece305d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c127cf'},body:JSON.stringify({sessionId:'c127cf',runId:ADMIN_COUNTS_DEBUG_RUN_ID,hypothesisId:'H2',location:'imageService.ts:getAdminSourceCounts:error',message:'aggregation query batch failed',data:{error:error instanceof Error ? error.message : String(error),quota:isQuotaError(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (isQuotaError(error)) {
      writeCountsBackoffUntilMs(Date.now() + ADMIN_SOURCE_COUNTS_ERROR_BACKOFF_MS);
      return fallbackCounts;
    }
    if (adminSourceCountsCache) {
      return adminSourceCountsCache.value;
    }
    return fallbackCounts;
  }).finally(() => {
    adminSourceCountsInFlight = null;
  });

  return adminSourceCountsInFlight;
}

/**
 * Fetch submissions in pages for admin review.
 */
export async function getAdminSubmissionsPage(options: {
  status?: 'pending' | 'approved' | 'denied' | 'all';
  pageSize?: number;
  cursor?: string | null;
} = {}): Promise<AdminPageResult<AdminSubmissionPageItem>> {
  const pageSize = options.pageSize ?? 12;
  const status = options.status ?? 'all';
  const cursor = options.cursor ?? null;
  const submissionsRef = collection(db, 'submissions');

  const constraints: QueryConstraint[] = [];
  if (status !== 'all') {
    constraints.push(where('status', '==', status));
  }
  constraints.push(orderBy(documentId()));
  if (cursor) {
    constraints.push(startAfter(cursor));
  }
  constraints.push(limit(pageSize + 1));

  const snapshot = await getDocs(query(submissionsRef, ...constraints));
  const hasMore = snapshot.docs.length > pageSize;
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
  const nextCursor = hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null;

  const items = pageDocs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const buildingName = typeof data.buildingName === 'string'
      ? data.buildingName
      : (typeof data.building === 'string' ? data.building : null);

    return {
      id: docSnap.id,
      photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
      location: parseLocation(data.location),
      floor: typeof data.floor === 'number' ? data.floor : null,
      difficulty: typeof data.difficulty === 'string' ? data.difficulty : null,
      photoName: typeof data.photoName === 'string' ? data.photoName : null,
      buildingName,
      description: typeof data.description === 'string' ? data.description : null,
      status: typeof data.status === 'string' ? data.status : 'pending',
      createdAt: data.createdAt ?? null,
      reviewedAt: data.reviewedAt ?? null
    } as AdminSubmissionPageItem;
  });

  return { items, hasMore, nextCursor };
}

/**
 * Fetch game images in pages for admin review.
 */
export async function getAdminImagesPage(options: {
  pageSize?: number;
  cursor?: string | null;
} = {}): Promise<AdminPageResult<AdminImagePageItem>> {
  const pageSize = options.pageSize ?? 12;
  const cursor = options.cursor ?? null;
  const imagesRef = collection(db, 'images');

  const constraints: QueryConstraint[] = [orderBy(documentId())];
  if (cursor) {
    constraints.push(startAfter(cursor));
  }
  constraints.push(limit(pageSize + 1));

  const snapshot = await getDocs(query(imagesRef, ...constraints));
  const hasMore = snapshot.docs.length > pageSize;
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
  const nextCursor = hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null;

  const items = pageDocs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    return {
      id: docSnap.id,
      url: typeof data.url === 'string' ? data.url : null,
      correctLocation: parseLocation(data.correctLocation),
      correctFloor: typeof data.correctFloor === 'number' ? data.correctFloor : null,
      difficulty: typeof data.difficulty === 'string' ? data.difficulty : null,
      description: typeof data.description === 'string' ? data.description : null
    } as AdminImagePageItem;
  });

  return { items, hasMore, nextCursor };
}

/**
 * Warm the approved image metadata cache.
 */
export async function primeApprovedImagesCache(): Promise<void> {
  // Index-only path no longer preloads large metadata.
}

/**
 * Fetches all images from Firestore's images collection
 */
export async function getAllImages(): Promise<GameImage[]> {
  try {
    const imagesRef = collection(db, 'images');
    const snapshot = await getDocs(imagesRef);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as GameImage[];
  } catch (error) {
    console.error('Error fetching all images from Firestore:', error);
    return [];
  }
}

/**
 * Get all sample images (useful for testing)
 */
export function getAllSampleImages(): SampleImage[] {
  return [...SAMPLE_IMAGES];
}

/**
 * Deletes a submission from the submissions collection
 */
export async function deleteSubmission(submissionId: string): Promise<void> {
  await deleteDoc(doc(db, 'submissions', submissionId));
}

/**
 * Deletes an image from the images collection
 */
export async function deleteImage(imageId: string): Promise<void> {
  await deleteDoc(doc(db, 'images', imageId));
}
