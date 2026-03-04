import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import { db } from '../firebase';

export type ImagePoolSourceType = 'image' | 'submission';

export interface ImagePoolLocation {
  x: number;
  y: number;
}

export interface ImagePoolEntry {
  sourceType: ImagePoolSourceType;
  sourceId: string;
  url: string;
  difficulty: string | null;
  correctLocation: ImagePoolLocation;
  correctFloor: number | null;
  buildingName: string | null;
  description: string | null;
  active: boolean;
  updatedAtMs: number;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLocation(value: unknown): ImagePoolLocation | null {
  if (!value || typeof value !== 'object') return null;
  const maybe = value as { x?: unknown; y?: unknown };
  if (typeof maybe.x !== 'number' || typeof maybe.y !== 'number') return null;
  return { x: maybe.x, y: maybe.y };
}

function poolDocId(sourceType: ImagePoolSourceType, sourceId: string): string {
  return `${sourceType}_${sourceId}`;
}

function buildEntry(
  sourceType: ImagePoolSourceType,
  sourceId: string,
  payload: {
    url: unknown;
    difficulty: unknown;
    correctLocation: unknown;
    correctFloor: unknown;
    buildingName?: unknown;
    description?: unknown;
  }
): ImagePoolEntry | null {
  const url = normalizeString(payload.url);
  const correctLocation = normalizeLocation(payload.correctLocation);
  if (!url || !correctLocation) return null;

  const difficultyValue = normalizeString(payload.difficulty);
  const difficulty = difficultyValue === 'all' ? null : difficultyValue;
  const correctFloor = typeof payload.correctFloor === 'number' ? payload.correctFloor : null;
  const buildingName = normalizeString(payload.buildingName);
  const description = normalizeString(payload.description) ?? buildingName;

  return {
    sourceType,
    sourceId,
    url,
    difficulty,
    correctLocation,
    correctFloor,
    buildingName,
    description,
    active: true,
    updatedAtMs: Date.now()
  };
}

export function buildImagePoolEntryFromImageDoc(sourceId: string, data: Record<string, unknown>): ImagePoolEntry | null {
  return buildEntry('image', sourceId, {
    url: data.url,
    difficulty: data.difficulty,
    correctLocation: data.correctLocation,
    correctFloor: data.correctFloor,
    buildingName: data.buildingName ?? data.building,
    description: data.description
  });
}

export function buildImagePoolEntryFromSubmissionDoc(sourceId: string, data: Record<string, unknown>): ImagePoolEntry | null {
  return buildEntry('submission', sourceId, {
    url: data.photoURL,
    difficulty: data.difficulty,
    correctLocation: data.location,
    correctFloor: data.floor,
    buildingName: data.buildingName ?? data.building,
    description: data.description
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

async function writeEntriesInChunks(database: Firestore, entries: ImagePoolEntry[], chunkSize = 400): Promise<void> {
  for (let start = 0; start < entries.length; start += chunkSize) {
    const batch = writeBatch(database);
    const chunk = entries.slice(start, start + chunkSize);
    chunk.forEach((entry) => {
      batch.set(doc(database, 'imagePool', poolDocId(entry.sourceType, entry.sourceId)), entry, { merge: true });
    });
    await batch.commit();
  }
}

export async function backfillImagePool(): Promise<void> {
  const [imagesSnapshot, approvedSubsSnapshot] = await Promise.all([
    getDocs(collection(db, 'images')),
    getDocs(query(collection(db, 'submissions'), where('status', '==', 'approved')))
  ]);

  const entries: ImagePoolEntry[] = [];

  imagesSnapshot.docs.forEach((docSnap) => {
    const entry = buildImagePoolEntryFromImageDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (entry) entries.push(entry);
  });

  approvedSubsSnapshot.docs.forEach((docSnap) => {
    const entry = buildImagePoolEntryFromSubmissionDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
    if (entry) entries.push(entry);
  });

  if (entries.length === 0) return;
  await writeEntriesInChunks(db, entries);
}
