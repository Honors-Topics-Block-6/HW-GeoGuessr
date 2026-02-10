import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// Sample images for development (used when Firestore has no data)
const SAMPLE_IMAGES = [
  {
    id: 'sample-1',
    url: 'https://images.unsplash.com/photo-1562774053-701939374585?w=800&q=80',
    correctLocation: { x: 35, y: 45 },
    correctFloor: 2,
    description: 'Main hallway near the library'
  },
  {
    id: 'sample-2',
    url: 'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?w=800&q=80',
    correctLocation: { x: 65, y: 30 },
    correctFloor: 1,
    description: 'Science building entrance'
  },
  {
    id: 'sample-3',
    url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&q=80',
    correctLocation: { x: 80, y: 60 },
    correctFloor: 1,
    description: 'Gymnasium interior'
  },
  {
    id: 'sample-4',
    url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&q=80',
    correctLocation: { x: 25, y: 75 },
    correctFloor: 3,
    description: 'Arts center studio'
  },
  {
    id: 'sample-5',
    url: 'https://images.unsplash.com/photo-1519452635265-7b1fbfd1e4e0?w=800&q=80',
    correctLocation: { x: 50, y: 50 },
    correctFloor: 2,
    description: 'Outdoor courtyard view'
  }
];

/**
 * Fetches a random image from Firestore
 * Falls back to sample images if Firestore is empty or unavailable
 */
export async function getRandomImage() {
  try {
    const imagesRef = collection(db, 'images');
    const snapshot = await getDocs(imagesRef);

    if (snapshot.empty) {
      console.log('No images in Firestore, using sample images');
      return getRandomSampleImage();
    }

    const images = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const randomIndex = Math.floor(Math.random() * images.length);
    return images[randomIndex];
  } catch (error) {
    console.error('Error fetching from Firestore:', error);
    console.log('Falling back to sample images');
    return getRandomSampleImage();
  }
}

/**
 * Returns a random sample image for development
 */
export function getRandomSampleImage() {
  const randomIndex = Math.floor(Math.random() * SAMPLE_IMAGES.length);
  return SAMPLE_IMAGES[randomIndex];
}

/**
 * Get all sample images (useful for testing)
 */
export function getAllSampleImages() {
  return [...SAMPLE_IMAGES];
}
