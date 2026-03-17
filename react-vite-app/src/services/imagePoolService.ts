import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  orderBy,
  startAfter,
  limit,
  documentId,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';

export type ImagePoolSourceType = 'image' | 'submission';

export interface ImagePoolEntry {
  sourceType: ImagePoolSourceType;
  sourceId: string;
  difficulty: string | null;
  active: boolean;
  randomKey: number;
  updatedAtMs: number;
  tournament: boolean;
}

export interface BackfillImagePoolOptions {
  imageCursor?: string | null;
  submissionCursor?: string | null;
  maxDocsPerSource?: number;
  commitChunkSize?: number;
  maxRetriesPerChunk?: number;
}

export interface BackfillImagePoolResult {
  processedImages: number;
  processedSubmissions: number;
  written: number;
  skipped: number;
  nextImageCursor: string | null;
  nextSubmissionCursor: string | null;
  imageDone: boolean;
  submissionDone: boolean;
  done: boolean;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasPlayableImageFields(data: Record<string, unknown>): boolean {
  const url = normalizeString(data.url);
  const location = data.correctLocation as { x?: unknown; y?: unknown } | undefined;
  return Boolean(
    url &&
    location &&
    typeof location.x === 'number' &&
    typeof location.y === 'number'
  );
}

function hasPlayableSubmissionFields(data: Record<string, unknown>): boolean {
  const url = normalizeString(data.photoURL);
  const location = data.location as { x?: unknown; y?: unknown } | undefined;
  return Boolean(
    url &&
    location &&
    typeof location.x === 'number' &&
    typeof location.y === 'number'
  );
}

function poolDocId(sourceType: ImagePoolSourceType, sourceId: string): string {
  return `${sourceType}_${sourceId}`;
}

function buildEntry(
  sourceType: ImagePoolSourceType,
  sourceId: string,
  payload: { difficulty: unknown; active?: unknown; randomKey?: unknown; tournament?: unknown }
): ImagePoolEntry {
  const difficultyValue = normalizeString(payload.difficulty);
  const difficulty = difficultyValue === 'all' ? null : difficultyValue;
  const active = typeof payload.active === 'boolean' ? payload.active : true;
  const randomKey = typeof payload.randomKey === 'number' ? payload.randomKey : Math.random();
  const tournament = typeof payload.tournament === 'boolean' ? payload.tournament : false;

  return {
    sourceType,
    sourceId,
    difficulty,
    active,
    randomKey,
    updatedAtMs: Date.now(),
    tournament
  };
}

export function buildImagePoolEntryFromImageDoc(sourceId: string, data: Record<string, unknown>): ImagePoolEntry | null {
  if (!hasPlayableImageFields(data)) return null;
  return buildEntry('image', sourceId, {
    difficulty: data.difficulty,
    active: true,
    tournament: false
  });
}

export function buildImagePoolEntryFromSubmissionDoc(sourceId: string, data: Record<string, unknown>): ImagePoolEntry | null {
  if (!hasPlayableSubmissionFields(data)) return null;
  const status = normalizeString(data.status) ?? 'approved';
  const isTournament = status === 'tournament_approved';
  const isActive = status === 'approved' || status === 'tournament_approved';
  return buildEntry('submission', sourceId, {
    difficulty: data.difficulty,
    active: isActive,
    tournament: isTournament
  });
}

export async function upsertImagePoolEntry(entry: ImagePoolEntry): Promise<void> {
  await setDoc(doc(db, 'imagePool', poolDocId(entry.sourceType, entry.sourceId)), entry, { merge: true });
}

export async function removeImagePoolEntry(sourceType: ImagePoolSourceType, sourceId: string): Promise<void> {
  await setDoc(
    doc(db, 'imagePool', poolDocId(sourceType, sourceId)),
    { active: false, updatedAtMs: Date.now() },
    { merge: true }
  );
}

function getLastDocId(snapshotDocs: QueryDocumentSnapshot<DocumentData>[]): string | null {
  if (snapshotDocs.length === 0) return null;
  return snapshotDocs[snapshotDocs.length - 1].id;
}

async function commitChunkWithRetry(
  database: Firestore,
  entries: ImagePoolEntry[],
  chunkSize: number,
  maxRetriesPerChunk: number
): Promise<number> {
  let written = 0;
  for (let start = 0; start < entries.length; start += chunkSize) {
    const chunk = entries.slice(start, start + chunkSize);
    let attempt = 0;
    while (attempt <= maxRetriesPerChunk) {
      const batch = writeBatch(database);
      chunk.forEach((entry) => {
        batch.set(doc(database, 'imagePool', poolDocId(entry.sourceType, entry.sourceId)), entry, { merge: true });
      });
      try {
        await batch.commit();
        written += chunk.length;
        break;
      } catch (error) {
        attempt += 1;
        if (attempt > maxRetriesPerChunk) {
          throw error;
        }
        const backoffMs = Math.min(8_000, 500 * 2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  return written;
}

async function fetchImageBatch(cursor: string | null, maxDocsPerSource: number): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const snapshot = cursor
    ? await getDocs(query(collection(db, 'images'), orderBy(documentId()), startAfter(cursor), limit(maxDocsPerSource)))
    : await getDocs(query(collection(db, 'images'), orderBy(documentId()), limit(maxDocsPerSource)));
  return snapshot.docs;
}

async function fetchSubmissionBatch(cursor: string | null, maxDocsPerSource: number): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const snapshot = cursor
    ? await getDocs(query(
      collection(db, 'submissions'),
      where('status', 'in', ['approved', 'tournament_approved']),
      orderBy(documentId()),
      startAfter(cursor),
      limit(maxDocsPerSource)
    ))
    : await getDocs(query(
      collection(db, 'submissions'),
      where('status', 'in', ['approved', 'tournament_approved']),
      orderBy(documentId()),
      limit(maxDocsPerSource)
    ));
  return snapshot.docs;
}

export async function backfillImagePool(options: BackfillImagePoolOptions = {}): Promise<BackfillImagePoolResult> {
  const maxDocsPerSource = options.maxDocsPerSource ?? 40;
  const commitChunkSize = options.commitChunkSize ?? 20;
  const maxRetriesPerChunk = options.maxRetriesPerChunk ?? 4;
  const imageCursor = options.imageCursor ?? null;
  const submissionCursor = options.submissionCursor ?? null;

  const [imageDocs, submissionDocs] = await Promise.all([
    fetchImageBatch(imageCursor, maxDocsPerSource),
    fetchSubmissionBatch(submissionCursor, maxDocsPerSource)
  ]);

  const entries: ImagePoolEntry[] = [];
  let skipped = 0;

  imageDocs.forEach((docSnap) => {
    const entry = buildImagePoolEntryFromImageDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (entry) entries.push(entry);
    else skipped += 1;
  });

  submissionDocs.forEach((docSnap) => {
    const entry = buildImagePoolEntryFromSubmissionDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (entry) entries.push(entry);
    else skipped += 1;
  });

  const written = entries.length > 0
    ? await commitChunkWithRetry(db, entries, commitChunkSize, maxRetriesPerChunk)
    : 0;

  const nextImageCursor = getLastDocId(imageDocs);
  const nextSubmissionCursor = getLastDocId(submissionDocs);
  const imageDone = imageDocs.length < maxDocsPerSource;
  const submissionDone = submissionDocs.length < maxDocsPerSource;

  return {
    processedImages: imageDocs.length,
    processedSubmissions: submissionDocs.length,
    written,
    skipped,
    nextImageCursor,
    nextSubmissionCursor,
    imageDone,
    submissionDone,
    done: imageDone && submissionDone
  };
}

export async function backfillImagePoolAllPasses(
  options: Omit<BackfillImagePoolOptions, 'imageCursor' | 'submissionCursor'> = {}
): Promise<BackfillImagePoolResult> {
  let imageCursor: string | null = null;
  let submissionCursor: string | null = null;
  let totals: BackfillImagePoolResult = {
    processedImages: 0,
    processedSubmissions: 0,
    written: 0,
    skipped: 0,
    nextImageCursor: null,
    nextSubmissionCursor: null,
    imageDone: false,
    submissionDone: false,
    done: false
  };

  for (let pass = 0; pass < 500; pass += 1) {
    const result = await backfillImagePool({
      ...options,
      imageCursor,
      submissionCursor
    });
    totals = {
      processedImages: totals.processedImages + result.processedImages,
      processedSubmissions: totals.processedSubmissions + result.processedSubmissions,
      written: totals.written + result.written,
      skipped: totals.skipped + result.skipped,
      nextImageCursor: result.nextImageCursor,
      nextSubmissionCursor: result.nextSubmissionCursor,
      imageDone: result.imageDone,
      submissionDone: result.submissionDone,
      done: result.done
    };
    if (result.done) return totals;
    imageCursor = result.nextImageCursor;
    submissionCursor = result.nextSubmissionCursor;
  }

  return totals;
}
