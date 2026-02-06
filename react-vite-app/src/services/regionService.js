import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Fetches all regions from Firestore
 */
export async function getRegions() {
  try {
    const regionsRef = collection(db, 'regions');
    const snapshot = await getDocs(regionsRef);

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching regions:', error);
    return [];
  }
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * Both point and polygon use percentage coordinates (0-100)
 * @param {Object} point - {x, y} coordinates (0-100 percentage)
 * @param {Array} polygon - Array of {x, y} points defining the polygon (0-100 percentage)
 * @returns {boolean} - True if point is inside the polygon
 */
export function isPointInPolygon(point, polygon) {
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
 * Find which region a point is in and return its floors
 * Both point and regions use percentage coordinates (0-100)
 * @param {Object} point - {x, y} coordinates (0-100 percentage from MapPicker)
 * @param {Array} regions - Array of region objects with polygon and floors
 * @returns {Array|null} - Array of floor numbers if in a region, null otherwise
 */
export function getFloorsForPoint(point, regions) {
  if (!regions || regions.length === 0) return null;

  for (const region of regions) {
    if (isPointInPolygon(point, region.polygon)) {
      return region.floors || [];
    }
  }

  return null;
}
