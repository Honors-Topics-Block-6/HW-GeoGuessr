/**
 * Deletes testing/sample images from Firebase.
 * Removes documents sample-1 through sample-5 from:
 * - images collection
 * - imagePool collection (doc ids: image_sample-1, image_sample-2, etc.)
 *
 * Run with: node scripts/delete-testing-images.mjs
 * Requires VITE_FIREBASE_* env vars to be set.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};

if (!firebaseConfig.projectId) {
  throw new Error('Missing Firebase env vars. Export VITE_FIREBASE_* before running.');
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SAMPLE_IDS = ['sample-1', 'sample-2', 'sample-3', 'sample-4', 'sample-5'];

function poolDocId(sourceId) {
  return `image_${sourceId}`;
}

async function run() {
  let deletedImages = 0;
  let deletedPool = 0;

  for (const id of SAMPLE_IDS) {
    const imageRef = doc(db, 'images', id);
    const imageSnap = await getDoc(imageRef);
    if (imageSnap.exists()) {
      await deleteDoc(imageRef);
      deletedImages += 1;
      console.info(`Deleted images/${id}`);
    }

    const poolId = poolDocId(id);
    const poolRef = doc(db, 'imagePool', poolId);
    const poolSnap = await getDoc(poolRef);
    if (poolSnap.exists()) {
      await deleteDoc(poolRef);
      deletedPool += 1;
      console.info(`Deleted imagePool/${poolId}`);
    }
  }

  console.info(`Done. Deleted ${deletedImages} from images, ${deletedPool} from imagePool.`);
}

run().catch((error) => {
  console.error('Delete failed:', error);
  process.exitCode = 1;
});
