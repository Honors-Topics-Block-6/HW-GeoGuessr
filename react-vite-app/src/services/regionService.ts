import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ────── Types ──────

export interface Point {
  x: number;
  y: number;
}

export interface Region {
  id: string;
  polygon: Point[];
  floors: number[];
  [key: string]: unknown;
}

export interface PlayingArea {
  polygon: Point[];
  [key: string]: unknown;
}

// ────── Functions ──────

/**
 * Fetches all regions from Firestore
 */
export async function getRegions(): Promise<Region[]> {
  try {
    const regionsRef = collection(db, 'regions');
    const snapshot = await getDocs(regionsRef);

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    })) as Region[];
  } catch (error) {
    console.error('Error fetching regions:', error);
    return [];
  }
}

/**
 * Fetches the playing area from Firestore settings
 */
export async function getPlayingArea(): Promise<PlayingArea | null> {
  try {
    const playingAreaRef = doc(db, 'settings', 'playingArea');
    const docSnap = await getDoc(playingAreaRef);

    if (docSnap.exists()) {
      return docSnap.data() as PlayingArea;
    }

    return null;
  } catch (error) {
    console.error('Error fetching playing area:', error);
    return null;
  }
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * Both point and polygon use percentage coordinates (0-100)
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const { x, y } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Find which region a point is in and return the region
 * Both point and regions use percentage coordinates (0-100)
 */
export function getRegionForPoint(point: Point, regions: Region[]): Region | null {
  if (!regions || regions.length === 0) return null;

  for (const region of regions) {
    if (isPointInPolygon(point, region.polygon)) {
      return region;
    }
  }

  return null;
}

/**
 * Find which region a point is in and return its floors
 * Both point and regions use percentage coordinates (0-100)
 */
export function getFloorsForPoint(point: Point, regions: Region[]): number[] | null {
  const region = getRegionForPoint(point, regions);
  return region?.floors || null;
}

/**
 * Check if a point is inside the playing area
 */
export function isPointInPlayingArea(point: Point, playingArea: PlayingArea | null): boolean {
  // If no playing area is defined, allow clicks anywhere
  if (!playingArea || !playingArea.polygon || playingArea.polygon.length < 3) {
    return true;
  }

  return isPointInPolygon(point, playingArea.polygon);
}
