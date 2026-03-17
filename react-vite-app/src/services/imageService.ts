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
import { isTournamentModeEnabled } from './appSettingsService';

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

export type AdminSourceCountsResultSource = 'live' | 'cache' | 'persisted' | 'backoff';

export interface AdminSourceCountsResult extends AdminSourceCounts {
  isFallback: boolean;
  source: AdminSourceCountsResultSource;
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
let adminSourceCountsInFlight: Promise<AdminSourceCountsResult> | null = null;
const ADMIN_SOURCE_COUNTS_BACKOFF_KEY = 'admin.sourceCounts.backoffUntilMs';
const ADMIN_SOURCE_COUNTS_ERROR_BACKOFF_MS = 5 * 60_000;
const ADMIN_SOURCE_COUNTS_CACHE_KEY = 'admin.sourceCounts.cached.v1';

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

function readPersistedSourceCounts(): AdminSourceCounts | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ADMIN_SOURCE_COUNTS_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AdminSourceCounts>;
    if (
      typeof parsed.images !== 'number' ||
      typeof parsed.submissions !== 'number' ||
      typeof parsed.pending !== 'number' ||
      typeof parsed.approved !== 'number' ||
      typeof parsed.denied !== 'number'
    ) {
      return null;
    }
    return {
      images: Math.max(0, parsed.images),
      submissions: Math.max(0, parsed.submissions),
      pending: Math.max(0, parsed.pending),
      approved: Math.max(0, parsed.approved),
      denied: Math.max(0, parsed.denied)
    };
  } catch {
    return null;
  }
}

function writePersistedSourceCounts(value: AdminSourceCounts): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_SOURCE_COUNTS_CACHE_KEY, JSON.stringify(value));
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const code = typeof maybe.code === 'string' ? maybe.code.toLowerCase() : '';
  const message = typeof maybe.message === 'string' ? maybe.message.toLowerCase() : '';
  return code.includes('resource-exhausted') || message.includes('quota exceeded');
}

// ────── Constants ──────

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

async function pickPoolCandidate(difficulty: string | null, tournamentMode: boolean): Promise<{ id: string; sourceType: 'image' | 'submission'; sourceId: string; difficulty: string | null } | null> {
  const pivot = randomKey();

  let snap;
  try {
    const q1 = query(
      collection(db, 'imagePool'),
      where('active', '==', true),
      where('tournament', '==', tournamentMode),
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
        where('active', '==', true),
        where('tournament', '==', tournamentMode),
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

  const status = data.status as string | undefined;
  if (status !== 'approved' && status !== 'tournament_approved') return null;
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
  allowExclusions: boolean,
  tournamentMode: boolean
): Promise<GameImage | null> {
  const attemptedCandidateIds = new Set<string>();
  const requiresDifficulty = Boolean(difficulty && difficulty !== 'all');

  for (let attempt = 0; attempt < RANDOM_SELECTION_ATTEMPTS; attempt += 1) {
    const candidate = await pickPoolCandidate(difficulty, tournamentMode);
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
    const tournamentMode = await isTournamentModeEnabled();
    const withExclusion = await selectRandomHydratedImage(difficulty, excludedIds, excludedUrls, true, tournamentMode);
    if (withExclusion) {
      console.info(`[getRandomImage] selected in ${Date.now() - startMs}ms (with exclusions, tournament=${tournamentMode})`);
      return withExclusion;
    }
    const fallback = await selectRandomHydratedImage(difficulty, excludedIds, excludedUrls, false, tournamentMode);
    console.info(`[getRandomImage] selected in ${Date.now() - startMs}ms (fallback=${fallback ? 'hit' : 'miss'}, tournament=${tournamentMode})`);
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
export async function getAdminSourceCounts(): Promise<AdminSourceCountsResult> {
  const now = Date.now();
  const persistedCounts = readPersistedSourceCounts();
  const fallbackCounts: AdminSourceCounts = adminSourceCountsCache?.value ?? {
    images: persistedCounts?.images ?? 0,
    submissions: persistedCounts?.submissions ?? 0,
    pending: persistedCounts?.pending ?? 0,
    approved: persistedCounts?.approved ?? 0,
    denied: persistedCounts?.denied ?? 0
  };

  const backoffUntilMs = readCountsBackoffUntilMs();
  if (backoffUntilMs > now) {
    return {
      ...fallbackCounts,
      isFallback: true,
      source: persistedCounts ? 'persisted' : 'backoff'
    };
  }

  if (adminSourceCountsCache && adminSourceCountsCache.expiresAtMs > now) {
    return {
      ...adminSourceCountsCache.value,
      isFallback: false,
      source: 'cache'
    };
  }
  if (adminSourceCountsInFlight) {
    return adminSourceCountsInFlight;
  }

  const imagePoolRef = collection(db, 'imagePool');
  const imagesRef = collection(db, 'images');
  const submissionsRef = collection(db, 'submissions');
  adminSourceCountsInFlight = (async () => {
    try {
      // Use precomputed imagePool totals for stable denominator, with images collection as safety floor.
      const imagePoolImageCount = await getCountFromServer(query(
        imagePoolRef,
        where('active', '==', true),
        where('sourceType', '==', 'image')
      ));
      const imagesCount = await getCountFromServer(imagesRef);
      const submissionsCount = await getCountFromServer(submissionsRef);
      const pendingCount = await getCountFromServer(query(submissionsRef, where('status', '==', 'pending')));
      const approvedCount = await getCountFromServer(query(submissionsRef, where('status', '==', 'approved')));
      const deniedCount = await getCountFromServer(query(submissionsRef, where('status', '==', 'denied')));

      const value: AdminSourceCounts = {
        images: Math.max(imagePoolImageCount.data().count, imagesCount.data().count),
        submissions: submissionsCount.data().count,
        pending: pendingCount.data().count,
        approved: approvedCount.data().count,
        denied: deniedCount.data().count
      };
      adminSourceCountsCache = {
        value,
        expiresAtMs: Date.now() + ADMIN_SOURCE_COUNTS_TTL_MS
      };
      writePersistedSourceCounts(value);
      writeCountsBackoffUntilMs(0);
      return {
        ...value,
        isFallback: false,
        source: 'live'
      };
    } catch (error) {
      if (isQuotaError(error)) {
        writeCountsBackoffUntilMs(Date.now() + ADMIN_SOURCE_COUNTS_ERROR_BACKOFF_MS);
        return {
          ...fallbackCounts,
          isFallback: true,
          source: persistedCounts ? 'persisted' : 'backoff'
        };
      }
      if (adminSourceCountsCache) {
        return {
          ...adminSourceCountsCache.value,
          isFallback: false,
          source: 'cache'
        };
      }
      return {
        ...fallbackCounts,
        isFallback: true,
        source: persistedCounts ? 'persisted' : 'backoff'
      };
    } finally {
      adminSourceCountsInFlight = null;
    }
  })();

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

/**
 * Fetches the correct location and floor for an image by pool id or document id.
 * Pool ids are "image_<docId>" or "submission_<docId>".
 * Returns null if not found or missing location.
 */
export async function getImageLocationByPoolId(
  imageId: string
): Promise<{ correctLocation: { x: number; y: number }; correctFloor: number | null } | null> {
  let sourceType: 'image' | 'submission';
  let sourceId: string;

  if (imageId.startsWith('image_')) {
    sourceType = 'image';
    sourceId = imageId.slice(6);
  } else if (imageId.startsWith('submission_')) {
    sourceType = 'submission';
    sourceId = imageId.slice(11);
  } else {
    // Assume raw document id - try images first
    sourceType = 'image';
    sourceId = imageId;
  }

  const coll = sourceType === 'image' ? 'images' : 'submissions';
  let snap = await getDoc(doc(db, coll, sourceId));
  let fromSubmissions = sourceType === 'submission';
  if (!snap.exists() && sourceType === 'image') {
    snap = await getDoc(doc(db, 'submissions', sourceId));
    fromSubmissions = snap.exists();
  }
  if (!snap.exists()) return null;

  const d = snap.data() as Record<string, unknown>;
  const loc = fromSubmissions
    ? (d.location as { x?: number; y?: number } | undefined)
    : (d.correctLocation as { x?: number; y?: number } | undefined);
  const fl = fromSubmissions
    ? (typeof d.floor === 'number' ? d.floor : null)
    : (typeof d.correctFloor === 'number' ? d.correctFloor : null);

  if (!loc || typeof loc.x !== 'number' || typeof loc.y !== 'number') return null;
  return { correctLocation: { x: loc.x, y: loc.y }, correctFloor: fl };
}
