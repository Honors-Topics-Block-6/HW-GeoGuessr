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
  documentId
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

const RANDOM_WINDOW_SIZE = 40;
const RANDOM_WINDOW_ATTEMPTS = 4;

function randomFirestoreIdPrefix(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function mapPoolDocToGameImage(id: string, data: ImagePoolEntry): GameImage | null {
  if (!data?.url || !data?.correctLocation) return null;
  return {
    id,
    url: data.url,
    correctLocation: data.correctLocation,
    correctFloor: data.correctFloor ?? null,
    difficulty: data.difficulty ?? null,
    buildingName: data.buildingName ?? null,
    description: data.description ?? data.buildingName ?? null
  };
}

async function fetchImagePoolWindow(difficulty: string | null): Promise<GameImage[]> {
  const pivot = randomFirestoreIdPrefix();
  const difficultyFilter = difficulty && difficulty !== 'all' ? [where('difficulty', '==', difficulty)] : [];

  const pivotQuery = query(
    collection(db, 'imagePool'),
    ...difficultyFilter,
    orderBy(documentId()),
    startAt(pivot),
    limit(RANDOM_WINDOW_SIZE)
  );
  let snapshot = await getDocs(pivotQuery);

  if (snapshot.empty) {
    const fallbackQuery = query(
      collection(db, 'imagePool'),
      ...difficultyFilter,
      orderBy(documentId()),
      limit(RANDOM_WINDOW_SIZE)
    );
    snapshot = await getDocs(fallbackQuery);
  }

  return snapshot.docs
    .map((docSnap) => mapPoolDocToGameImage(docSnap.id, docSnap.data() as ImagePoolEntry))
    .filter((image): image is GameImage => Boolean(image));
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
      const window = await fetchImagePoolWindow(difficulty);
      const availableImages = window.filter((image) => {
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
    const difficultyFilter = difficulty && difficulty !== 'all'
      ? query(collection(db, 'imagePool'), where('difficulty', '==', difficulty))
      : query(collection(db, 'imagePool'));
    const snapshot = await getDocs(difficultyFilter);
    return snapshot.docs
      .map((docSnap) => mapPoolDocToGameImage(docSnap.id, docSnap.data() as ImagePoolEntry))
      .filter((image): image is GameImage => Boolean(image));
  } catch (error) {
    console.error('Error fetching approved images:', error);
    return [];
  }
}

/**
 * Warm the approved image metadata cache.
 */
export async function primeApprovedImagesCache(): Promise<void> {
  return;
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
