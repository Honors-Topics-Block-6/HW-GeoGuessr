import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  orderBy,
  startAt,
  limit,
  documentId,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '../firebase';

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

interface ApprovedImageCache {
  fetchedAtMs: number;
  images: GameImage[];
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

const APPROVED_IMAGES_CACHE_TTL_MS = 60_000;
const RANDOM_WINDOW_SIZE = 40;
const RANDOM_WINDOW_ATTEMPTS = 4;
let approvedImagesCache: ApprovedImageCache | null = null;
let approvedImagesCachePromise: Promise<GameImage[]> | null = null;

function randomFirestoreIdPrefix(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function mapByDifficulty(images: GameImage[], difficulty: string | null): GameImage[] {
  // 'all' and null both mean "no filter"
  if (!difficulty || difficulty === 'all') {
    return images;
  }
  const filtered = images.filter((img) => img.difficulty === difficulty);
  if (filtered.length > 0) {
    return filtered;
  }
  console.warn(`No images found for difficulty "${difficulty}", using all images`);
  return images;
}

async function fetchApprovedImagesFromFirestore(): Promise<GameImage[]> {
  // Fetch from both sources in parallel
  const [imagesSnapshot, submissionsSnapshot] = await Promise.all([
    getDocs(collection(db, 'images')),
    getDocs(query(collection(db, 'submissions'), where('status', '==', 'approved')))
  ]);

  // Map images collection docs to the standard format
  const images: GameImage[] = imagesSnapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  })) as GameImage[];

  // Map approved submissions to the same format the game expects
  const approvedSubmissions: GameImage[] = submissionsSnapshot.docs.map(docSnap => {
    const data = docSnap.data() as Record<string, unknown>;
    const buildingName = (
      ((data.buildingName as string) || (data.building as string) || '').trim()
    ) || null;
    return {
      id: docSnap.id,
      url: data.photoURL as string,
      correctLocation: data.location as { x: number; y: number },
      correctFloor: data.floor as number | null,
      difficulty: (data.difficulty as string) || null,
      buildingName,
      description: buildingName
    };
  });

  return [...images, ...approvedSubmissions];
}

async function getApprovedImagesFromCache(forceRefresh = false): Promise<GameImage[]> {
  const now = Date.now();
  const cacheIsFresh =
    approvedImagesCache &&
    now - approvedImagesCache.fetchedAtMs < APPROVED_IMAGES_CACHE_TTL_MS;

  if (!forceRefresh && cacheIsFresh && approvedImagesCache) {
    return approvedImagesCache.images;
  }

  if (approvedImagesCachePromise) {
    return approvedImagesCachePromise;
  }

  approvedImagesCachePromise = fetchApprovedImagesFromFirestore()
    .then((images) => {
      approvedImagesCache = { fetchedAtMs: Date.now(), images };
      return images;
    })
    .finally(() => {
      approvedImagesCachePromise = null;
    });

  return approvedImagesCachePromise;
}

async function fetchImagesWindow(difficulty: string | null): Promise<GameImage[]> {
  const baseConstraints: QueryConstraint[] = [];
  if (difficulty && difficulty !== 'all') {
    baseConstraints.push(where('difficulty', '==', difficulty));
  }

  const pivot = randomFirestoreIdPrefix();
  const pivotQuery = query(
    collection(db, 'images'),
    ...baseConstraints,
    orderBy(documentId()),
    startAt(pivot),
    limit(RANDOM_WINDOW_SIZE)
  );
  let snapshot = await getDocs(pivotQuery);

  if (snapshot.empty) {
    const fallbackQuery = query(
      collection(db, 'images'),
      ...baseConstraints,
      orderBy(documentId()),
      limit(RANDOM_WINDOW_SIZE)
    );
    snapshot = await getDocs(fallbackQuery);
  }

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  })) as GameImage[];
}

async function fetchApprovedSubmissionsWindow(difficulty: string | null): Promise<GameImage[]> {
  const baseConstraints: QueryConstraint[] = [where('status', '==', 'approved')];
  if (difficulty && difficulty !== 'all') {
    baseConstraints.push(where('difficulty', '==', difficulty));
  }

  const pivot = randomFirestoreIdPrefix();
  const pivotQuery = query(
    collection(db, 'submissions'),
    ...baseConstraints,
    orderBy(documentId()),
    startAt(pivot),
    limit(RANDOM_WINDOW_SIZE)
  );
  let snapshot = await getDocs(pivotQuery);

  if (snapshot.empty) {
    const fallbackQuery = query(
      collection(db, 'submissions'),
      ...baseConstraints,
      orderBy(documentId()),
      limit(RANDOM_WINDOW_SIZE)
    );
    snapshot = await getDocs(fallbackQuery);
  }

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const buildingName = (
      ((data.buildingName as string) || (data.building as string) || '').trim()
    ) || null;
    return {
      id: docSnap.id,
      url: data.photoURL as string,
      correctLocation: data.location as { x: number; y: number },
      correctFloor: data.floor as number | null,
      difficulty: (data.difficulty as string) || null,
      buildingName,
      description: buildingName
    };
  });
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
  try {
    const excludedIds = new Set(options.excludeImageIds || []);
    const excludedUrls = new Set(options.excludeImageUrls || []);

    // Fetch only small random metadata windows per attempt (not full collections).
    for (let attempt = 0; attempt < RANDOM_WINDOW_ATTEMPTS; attempt += 1) {
      const [imageWindow, submissionWindow] = await Promise.all([
        fetchImagesWindow(difficulty),
        fetchApprovedSubmissionsWindow(difficulty)
      ]);
      const availableImages = [...imageWindow, ...submissionWindow].filter((image) => {
        if (!image?.url) return false;
        if (excludedIds.has(image.id)) return false;
        if (excludedUrls.has(image.url)) return false;
        return true;
      });

      if (availableImages.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableImages.length);
        return availableImages[randomIndex];
      }
    }

    return null;
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
    const allImages = await getApprovedImagesFromCache();
    return mapByDifficulty(allImages, difficulty);
  } catch (error) {
    console.error('Error fetching approved images:', error);
    return [];
  }
}

/**
 * Warm the approved image metadata cache.
 */
export async function primeApprovedImagesCache(): Promise<void> {
  await getApprovedImagesFromCache();
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
