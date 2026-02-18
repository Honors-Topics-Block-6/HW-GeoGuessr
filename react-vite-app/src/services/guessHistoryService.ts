import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface HeatmapPoint {
  x: number;
  y: number;
  weight: number;
}

interface HeatmapResponse {
  points: HeatmapPoint[];
  source: 'firestore' | 'mock';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function toHeatPoint(candidate: { x?: unknown; y?: unknown; weight?: unknown }, fallbackWeight = 1): HeatmapPoint | null {
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const weight = Number(candidate.weight ?? fallbackWeight);

  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }

  return {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100),
    weight: isFiniteNumber(weight) ? clamp(weight, 0.2, 6) : 1
  };
}

function extractPointFromDoc(docData: Record<string, unknown>): HeatmapPoint | null {
  const nested = (docData.guessLocation || docData.location || docData.coords) as { x?: unknown; y?: unknown } | undefined;
  if (nested) {
    return toHeatPoint({
      x: nested.x,
      y: nested.y,
      weight: docData.weight ?? docData.count
    });
  }

  return toHeatPoint({
    x: docData.x,
    y: docData.y,
    weight: docData.weight ?? docData.count
  });
}

function aggregateNearbyPoints(points: HeatmapPoint[]): HeatmapPoint[] {
  const bucketSize = 2;
  const buckets = new Map<string, HeatmapPoint>();

  points.forEach((point) => {
    const bx = Math.round(point.x / bucketSize) * bucketSize;
    const by = Math.round(point.y / bucketSize) * bucketSize;
    const key = `${bx}:${by}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.weight += point.weight;
      return;
    }
    buckets.set(key, { x: bx, y: by, weight: point.weight });
  });

  return Array.from(buckets.values())
    .map((point) => ({ ...point, weight: clamp(point.weight, 0.5, 8) }))
    .sort((a, b) => b.weight - a.weight);
}

function seededValue(seed: number, offset: number): number {
  const value = Math.sin(seed * 0.017 + offset * 12.345) * 43758.5453;
  return value - Math.floor(value);
}

function createMockHeatmapPoints(imageId: string, center = { x: 50, y: 50 }): HeatmapPoint[] {
  const seed = [...imageId].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const points: HeatmapPoint[] = [];

  for (let i = 0; i < 48; i += 1) {
    const isHotspot = i < 4;
    const spread = isHotspot ? 2 + seededValue(seed, i) * 6 : 10 + seededValue(seed, i) * 24;
    const angle = seededValue(seed, i + 999) * Math.PI * 2;
    const point = toHeatPoint({
      x: center.x + Math.cos(angle) * spread,
      y: center.y + Math.sin(angle) * spread,
      weight: isHotspot
        ? 3.2 + seededValue(seed, i + 1999) * 2.2
        : 0.35 + seededValue(seed, i + 1999) * 1.8
    });
    if (point) points.push(point);
  }

  const aggregated = aggregateNearbyPoints(points);
  const maxWeight = Math.max(...aggregated.map((point) => point.weight), 1);
  return aggregated.map((point) => {
    const normalized = point.weight / maxWeight;
    return { ...point, weight: 0.5 + Math.pow(normalized, 2.25) * 4.8 };
  });
}

export async function getGuessHeatmapDataForImage(
  imageId: string | null,
  options: { fallbackCenter?: { x: number; y: number } } = {}
): Promise<HeatmapResponse> {
  const fallbackCenter = options.fallbackCenter ?? { x: 50, y: 50 };
  if (!imageId) {
    return {
      points: createMockHeatmapPoints('no-image-id', fallbackCenter),
      source: 'mock'
    };
  }

  try {
    const guessesRef = collection(db, 'guesses');
    const q = query(guessesRef, where('imageId', '==', imageId), limit(400));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return {
        points: createMockHeatmapPoints(imageId, fallbackCenter),
        source: 'mock'
      };
    }

    const extracted = snapshot.docs
      .map((doc) => extractPointFromDoc(doc.data() as Record<string, unknown>))
      .filter((point): point is HeatmapPoint => Boolean(point));

    if (extracted.length === 0) {
      return {
        points: createMockHeatmapPoints(imageId, fallbackCenter),
        source: 'mock'
      };
    }

    return {
      points: aggregateNearbyPoints(extracted),
      source: 'firestore'
    };
  } catch (error) {
    console.warn('Guess heatmap fetch failed, using mock data:', error);
    return {
      points: createMockHeatmapPoints(imageId, fallbackCenter),
      source: 'mock'
    };
  }
}

