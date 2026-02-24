/**
 * Building polygons for the campus map (FINAL_MAP.png).
 * Coordinates are in percentage (0–100): x = left to right, y = top to bottom.
 * Polygons are created manually in the Map Editor and stored in Firestore.
 * Use getBuildingNameForPoint(polygons, point, isPointInPolygon) with the loaded polygons.
 */

export interface Point {
  x: number;
  y: number;
}

export interface BuildingPolygon {
  name: string;
  polygon: Point[];
}

/** No static polygons; all are loaded from Firestore via buildingPolygonService. */
export const BUILDING_POLYGONS: BuildingPolygon[] = [];

/**
 * Returns the building name if the point is inside any building polygon, else null.
 * Check in array order; first match wins.
 */
export function getBuildingNameForPoint(
  polygons: BuildingPolygon[],
  point: Point,
  isPointInPolygon: (point: Point, polygon: Point[]) => boolean
): string | null {
  for (const building of polygons) {
    if (building.polygon.length >= 3 && isPointInPolygon(point, building.polygon)) {
      return building.name;
    }
  }
  return null;
}
