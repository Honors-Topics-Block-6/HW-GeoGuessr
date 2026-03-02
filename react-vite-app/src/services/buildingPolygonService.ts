import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface BuildingPolygonData {
  name: string;
  polygon: { x: number; y: number }[];
}

const BUILDING_POLYGONS_REF = doc(db, 'settings', 'buildingPolygons');

/**
 * Load saved building polygons from Firestore.
 * Returns empty array if doc doesn't exist or on error.
 */
export async function getBuildingPolygons(): Promise<BuildingPolygonData[]> {
  try {
    const snap = await getDoc(BUILDING_POLYGONS_REF);
    if (snap.exists()) {
      const data = snap.data();
      const polygons = data?.polygons;
      return Array.isArray(polygons) ? polygons : [];
    }
    return [];
  } catch (err) {
    console.error('Error loading building polygons:', err);
    return [];
  }
}

/**
 * Save building polygons to Firestore.
 */
export async function setBuildingPolygons(polygons: BuildingPolygonData[]): Promise<void> {
  await setDoc(BUILDING_POLYGONS_REF, {
    polygons,
    updatedAt: serverTimestamp()
  });
}
