/**
 * Building hitbox polygons for the campus map (FINAL_MAP.png).
 * Coordinates are in percentage (0–100): x = left to right, y = top to bottom.
 * Used to auto-fill building/location when user clicks on the map.
 * Adjust points if your map layout differs.
 */

export interface Point {
  x: number;
  y: number;
}

export interface BuildingPolygon {
  name: string;
  polygon: Point[];
}

/** Polygons aligned to FINAL_MAP.png (Harvard-Westlake upper campus). */
export const BUILDING_POLYGONS: BuildingPolygon[] = [
  // Pool House — "this part of the field" (checked before Field so it wins)
  {
    name: 'Pool House',
    polygon: [
      { x: 4, y: 32 },
      { x: 14, y: 32 },
      { x: 14, y: 46 },
      { x: 4, y: 46 }
    ]
  },
  // Copses Family Pool — same part of field complex, adjacent to Pool House
  {
    name: 'Copses Family Pool',
    polygon: [
      { x: 12, y: 34 },
      { x: 24, y: 34 },
      { x: 24, y: 50 },
      { x: 12, y: 50 }
    ]
  },
  // Ted Slavin Field — main field only; doesn't cover pool/pool house area
  {
    name: 'Ted Slavin Field',
    polygon: [
      { x: 2, y: 16 },
      { x: 24, y: 16 },
      { x: 24, y: 34 },
      { x: 2, y: 34 }
    ]
  },
  // Taper Athletic Pavilion — right of pool
  {
    name: 'Taper Athletic Pavilion',
    polygon: [
      { x: 22, y: 42 },
      { x: 34, y: 42 },
      { x: 34, y: 58 },
      { x: 22, y: 58 }
    ]
  },
  // Ahmanson Lecture Hall — left of Seaver, along Sprague Plaza (listed before Munger so it wins at boundary)
  {
    name: 'Ahmanson Lecture Hall',
    polygon: [
      { x: 30, y: 38 },
      { x: 44, y: 38 },
      { x: 44, y: 52 },
      { x: 30, y: 52 }
    ]
  },
  // Munger Science Center — lower-left main campus, above pool; stops at Ahmanson so no overlap
  {
    name: 'Munger Science Center',
    polygon: [
      { x: 18, y: 34 },
      { x: 30, y: 34 },
      { x: 30, y: 52 },
      { x: 18, y: 52 }
    ]
  },
  // Harvard-Westlake Driveway — bottom-left, curving strip
  {
    name: 'Harvard Westlake Driveway',
    polygon: [
      { x: 0, y: 56 },
      { x: 28, y: 56 },
      { x: 28, y: 82 },
      { x: 0, y: 82 }
    ]
  },
  // Security Kiosk — along driveway
  {
    name: 'Security Kiosk',
    polygon: [
      { x: 16, y: 60 },
      { x: 24, y: 60 },
      { x: 24, y: 68 },
      { x: 16, y: 68 }
    ]
  },
  // Advancement House — lower-middle, right of Security Kiosk
  {
    name: 'Advancement House',
    polygon: [
      { x: 26, y: 62 },
      { x: 40, y: 62 },
      { x: 40, y: 76 },
      { x: 26, y: 76 }
    ]
  },
  // St. Saviour's Chapel — right side of map
  {
    name: "St. Saviour's Chapel",
    polygon: [
      { x: 66, y: 36 },
      { x: 82, y: 36 },
      { x: 82, y: 52 },
      { x: 66, y: 52 }
    ]
  },
  // Feldman-Horn — upper-right quadrant
  {
    name: 'Feldman-Horn',
    polygon: [
      { x: 54, y: 24 },
      { x: 70, y: 24 },
      { x: 70, y: 40 },
      { x: 54, y: 40 }
    ]
  },
  // Drama Lab — above Rugby Auditorium area
  {
    name: 'Drama Lab',
    polygon: [
      { x: 48, y: 26 },
      { x: 62, y: 26 },
      { x: 62, y: 38 },
      { x: 48, y: 38 }
    ]
  }
];

/**
 * Returns the building name if the point is inside any building polygon, else null.
 * Check in array order; first match wins (put smaller/more specific areas first if overlapping).
 */
export function getBuildingNameForPoint(
  point: Point,
  isPointInPolygon: (point: Point, polygon: Point[]) => boolean
): string | null {
  for (const building of BUILDING_POLYGONS) {
    if (building.polygon.length >= 3 && isPointInPolygon(point, building.polygon)) {
      return building.name;
    }
  }
  return null;
}
