import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAt,
  deleteDoc,
  doc
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

function emitDebugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
): void {
  fetch('http://127.0.0.1:7912/ingest/4a433f93-726b-4f45-8648-a37cd14c9d3b', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '86e883'
    },
    body: JSON.stringify({
      sessionId: '86e883',
      runId: 'initial',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
}

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
  // #region agent log
  emitDebugLog('H1_H2', 'imageService.ts:131', 'pickPoolCandidate:start', {
    difficulty,
    withDifficulty,
    pivot
  });
  // #endregion

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
    const e = err as { code?: string; message?: string };
    // #region agent log
    emitDebugLog('H1', 'imageService.ts:198', 'pickPoolCandidate:all_query_error', {
      code: e.code ?? null,
      message: e.message ?? null
    });
    // #endregion
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
      const e = err as { code?: string; message?: string };
      // #region agent log
      emitDebugLog('H1', 'imageService.ts:215', 'pickPoolCandidate:all_wrap_query_error', {
        code: e.code ?? null,
        message: e.message ?? null
      });
      // #endregion
      throw err;
    }
  }
  // #region agent log
  emitDebugLog('H3', 'imageService.ts:224', 'pickPoolCandidate:snapshot', {
    empty: snap.empty,
    size: snap.size,
    withDifficulty
  });
  // #endregion
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
      // #region agent log
      emitDebugLog('H3', 'imageService.ts:255', 'selectRandomHydratedImage:skip_difficulty_mismatch', {
        requestedDifficulty: difficulty,
        candidateDifficulty: candidate.difficulty
      });
      // #endregion
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
    // #region agent log
    emitDebugLog('H4_H5', 'imageService.ts:310', 'getRandomImage:start', {
      difficulty,
      excludedIdCount: excludedIds.size,
      excludedUrlCount: excludedUrls.size
    });
    // #endregion
    const withExclusion = await selectRandomHydratedImage(difficulty, excludedIds, excludedUrls, true);
    if (withExclusion) {
      console.info(`[getRandomImage] selected in ${Date.now() - startMs}ms (with exclusions)`);
      return withExclusion;
    }
    const fallback = await selectRandomHydratedImage(difficulty, excludedIds, excludedUrls, false);
    console.info(`[getRandomImage] selected in ${Date.now() - startMs}ms (fallback=${fallback ? 'hit' : 'miss'})`);
    return fallback;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    // #region agent log
    emitDebugLog('H1_H2_H3_H4_H5', 'imageService.ts:328', 'getRandomImage:error', {
      code: e.code ?? null,
      message: e.message ?? null
    });
    // #endregion
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
