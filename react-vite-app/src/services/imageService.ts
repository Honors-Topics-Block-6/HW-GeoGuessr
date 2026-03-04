import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
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
let approvedImagesCache: ApprovedImageCache | null = null;
let approvedImagesCachePromise: Promise<GameImage[]> | null = null;
let randomImageCallCount = 0;

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
    // #region agent log
    fetch('http://127.0.0.1:7912/ingest/4a433f93-726b-4f45-8648-a37cd14c9d3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86e883'},body:JSON.stringify({sessionId:'86e883',runId:'spin-debug-1',hypothesisId:'H2',location:'imageService.ts:getApprovedImagesFromCache:hit',message:'approved images cache hit',data:{cacheAgeMs:now - approvedImagesCache.fetchedAtMs,count:approvedImagesCache.images.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return approvedImagesCache.images;
  }

  if (approvedImagesCachePromise) {
    return approvedImagesCachePromise;
  }

  approvedImagesCachePromise = fetchApprovedImagesFromFirestore()
    .then((images) => {
      approvedImagesCache = { fetchedAtMs: Date.now(), images };
      // #region agent log
      fetch('http://127.0.0.1:7912/ingest/4a433f93-726b-4f45-8648-a37cd14c9d3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86e883'},body:JSON.stringify({sessionId:'86e883',runId:'spin-debug-1',hypothesisId:'H2',location:'imageService.ts:getApprovedImagesFromCache:miss',message:'approved images cache miss (fetched)',data:{count:images.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return images;
    })
    .finally(() => {
      approvedImagesCachePromise = null;
    });

  return approvedImagesCachePromise;
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
    randomImageCallCount += 1;
    const shouldLogCall = randomImageCallCount <= 20 || randomImageCallCount % 25 === 0;
    const stackLine = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown-caller';
    if (shouldLogCall) {
      // #region agent log
      fetch('http://127.0.0.1:7912/ingest/4a433f93-726b-4f45-8648-a37cd14c9d3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86e883'},body:JSON.stringify({sessionId:'86e883',runId:'spin-debug-2',hypothesisId:'H6',location:'imageService.ts:getRandomImage:entry',message:'getRandomImage called',data:{callCount:randomImageCallCount,difficulty,excludeIdsCount:options.excludeImageIds?.length ?? 0,excludeUrlsCount:options.excludeImageUrls?.length ?? 0,caller:stackLine},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }

    const approvedImages = await getAllApprovedImages(difficulty);
    const excludedIds = new Set(options.excludeImageIds || []);
    const excludedUrls = new Set(options.excludeImageUrls || []);
    const availableImages = approvedImages.filter((image) => {
      if (excludedIds.has(image.id)) return false;
      if (excludedUrls.has(image.url)) return false;
      return true;
    });
    if (shouldLogCall) {
      // #region agent log
      fetch('http://127.0.0.1:7912/ingest/4a433f93-726b-4f45-8648-a37cd14c9d3b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86e883'},body:JSON.stringify({sessionId:'86e883',runId:'spin-debug-2',hypothesisId:'H6',location:'imageService.ts:getRandomImage:postFilter',message:'getRandomImage filtered pool',data:{callCount:randomImageCallCount,approvedCount:approvedImages.length,availableCount:availableImages.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }

    if (availableImages.length === 0) {
      console.warn('No approved images found in any source');
      return null;
    }

    const randomIndex = Math.floor(Math.random() * availableImages.length);
    return availableImages[randomIndex];
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
