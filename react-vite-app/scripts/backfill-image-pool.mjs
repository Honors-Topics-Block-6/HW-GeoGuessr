import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  documentId,
  getDocs,
  writeBatch,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';

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

const STATE_DOC = doc(db, 'migrationState', 'imagePoolBackfillV1');
const PAGE_SIZE = Number(process.env.IMAGE_POOL_BACKFILL_PAGE_SIZE || 20);
const CHUNK_SIZE = Number(process.env.IMAGE_POOL_BACKFILL_CHUNK_SIZE || 10);
const MAX_PASSES = Number(process.env.IMAGE_POOL_BACKFILL_MAX_PASSES || 300);

function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasImageFields(data) {
  const loc = data.correctLocation;
  return Boolean(
    normalizeString(data.url) &&
    loc &&
    typeof loc.x === 'number' &&
    typeof loc.y === 'number'
  );
}

function hasSubmissionFields(data) {
  const loc = data.location;
  return Boolean(
    normalizeString(data.photoURL) &&
    loc &&
    typeof loc.x === 'number' &&
    typeof loc.y === 'number'
  );
}

function makeEntry(sourceType, sourceId, difficulty) {
  const difficultyValue = normalizeString(difficulty);
  return {
    sourceType,
    sourceId,
    difficulty: difficultyValue === 'all' ? null : difficultyValue,
    active: true,
    randomKey: Math.random(),
    updatedAtMs: Date.now()
  };
}

function poolDocId(sourceType, sourceId) {
  return `${sourceType}_${sourceId}`;
}

async function fetchImagePage(cursor) {
  const constraints = [orderBy(documentId()), limit(PAGE_SIZE)];
  if (cursor) constraints.splice(1, 0, startAfter(cursor));
  const snap = await getDocs(query(collection(db, 'images'), ...constraints));
  return snap.docs;
}

async function fetchSubmissionPage(cursor) {
  const constraints = [where('status', '==', 'approved'), orderBy(documentId()), limit(PAGE_SIZE)];
  if (cursor) constraints.splice(2, 0, startAfter(cursor));
  const snap = await getDocs(query(collection(db, 'submissions'), ...constraints));
  return snap.docs;
}

async function writeChunk(entries) {
  const batch = writeBatch(db);
  entries.forEach((entry) => {
    batch.set(doc(db, 'imagePool', poolDocId(entry.sourceType, entry.sourceId)), entry, { merge: true });
  });
  await batch.commit();
}

async function writeWithRetry(entries) {
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    let attempt = 0;
    while (attempt < 6) {
      try {
        await writeChunk(chunk);
        break;
      } catch (err) {
        attempt += 1;
        if (attempt >= 6) throw err;
        const backoffMs = Math.min(10000, 500 * 2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
}

async function readState() {
  const snap = await getDoc(STATE_DOC);
  if (!snap.exists()) {
    return { imageCursor: null, submissionCursor: null, done: false };
  }
  const data = snap.data();
  return {
    imageCursor: data.imageCursor || null,
    submissionCursor: data.submissionCursor || null,
    done: Boolean(data.done)
  };
}

async function persistState(state) {
  await setDoc(STATE_DOC, { ...state, updatedAtMs: Date.now() }, { merge: true });
}

async function run() {
  const state = await readState();
  let imageCursor = state.imageCursor;
  let submissionCursor = state.submissionCursor;

  if (state.done) {
    console.info('Backfill already marked done.');
    return;
  }

  let written = 0;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const [imageDocs, submissionDocs] = await Promise.all([
      fetchImagePage(imageCursor),
      fetchSubmissionPage(submissionCursor)
    ]);

    const entries = [];
    for (const docSnap of imageDocs) {
      const data = docSnap.data();
      if (!hasImageFields(data)) continue;
      entries.push(makeEntry('image', docSnap.id, data.difficulty));
    }
    for (const docSnap of submissionDocs) {
      const data = docSnap.data();
      if (!hasSubmissionFields(data)) continue;
      entries.push(makeEntry('submission', docSnap.id, data.difficulty));
    }

    if (entries.length > 0) {
      await writeWithRetry(entries);
      written += entries.length;
    }

    imageCursor = imageDocs.length > 0 ? imageDocs[imageDocs.length - 1].id : null;
    submissionCursor = submissionDocs.length > 0 ? submissionDocs[submissionDocs.length - 1].id : null;
    const imageDone = imageDocs.length < PAGE_SIZE;
    const submissionDone = submissionDocs.length < PAGE_SIZE;
    const done = imageDone && submissionDone;

    await persistState({
      imageCursor,
      submissionCursor,
      done
    });

    console.info(`pass=${pass + 1} imageDocs=${imageDocs.length} submissionDocs=${submissionDocs.length} writtenTotal=${written} done=${done}`);
    if (done) break;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

run().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
