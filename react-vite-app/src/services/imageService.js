import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// Sample images for development/testing
const SAMPLE_IMAGES = [
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

/**
 * Fetches a random image from all approved sources, optionally filtered by difficulty.
 * - Firestore 'images' collection (all are considered approved)
 * - Firestore 'submissions' collection with status 'approved'
 * @param {string|null} difficulty - 'easy', 'medium', 'hard', or null for all
 */
export async function getRandomImage(difficulty = null) {
  try {
    const approvedImages = await getAllApprovedImages(difficulty);

    if (approvedImages.length === 0) {
      console.warn('No approved images found in any source');
      return null;
    }

    const randomIndex = Math.floor(Math.random() * approvedImages.length);
    return approvedImages[randomIndex];
  } catch (error) {
    console.error('Error fetching random image:', error);
    return null;
  }
}

/**
 * Fetches all approved images from both the images collection
 * and approved submissions, optionally filtered by difficulty.
 * @param {string|null} difficulty - 'easy', 'medium', 'hard', or null for all
 */
export async function getAllApprovedImages(difficulty = null) {
  try {
    // Fetch from both sources in parallel
    const [imagesSnapshot, submissionsSnapshot] = await Promise.all([
      getDocs(collection(db, 'images')),
      getDocs(query(collection(db, 'submissions'), where('status', '==', 'approved')))
    ]);

    // Map images collection docs to the standard format
    const images = imagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Map approved submissions to the same format the game expects
    const approvedSubmissions = submissionsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        url: data.photoURL,
        correctLocation: data.location,
        correctFloor: data.floor,
        difficulty: data.difficulty || null,
        description: data.photoName || null
      };
    });

    let allImages = [...images, ...approvedSubmissions];

    // Filter by difficulty if specified
    if (difficulty) {
      const filtered = allImages.filter(img => img.difficulty === difficulty);
      // Fall back to all images if none match the difficulty
      if (filtered.length > 0) {
        allImages = filtered;
      } else {
        console.warn(`No images found for difficulty "${difficulty}", using all images`);
      }
    }

    return allImages;
  } catch (error) {
    console.error('Error fetching approved images:', error);
    return [];
  }
}

/**
 * Fetches all images from Firestore's images collection
 */
export async function getAllImages() {
  try {
    const imagesRef = collection(db, 'images');
    const snapshot = await getDocs(imagesRef);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching all images from Firestore:', error);
    return [];
  }
}

/**
 * Get all sample images (useful for testing)
 */
export function getAllSampleImages() {
  return [...SAMPLE_IMAGES];
}
