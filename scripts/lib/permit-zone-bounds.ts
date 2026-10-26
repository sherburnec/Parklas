// Bounds and outside-the-zone mask for each permit zone (task M5-9). Pure logic, no file I/O.
// The page fits the map to `bounds` and draws `mask` to dim everything outside the zone, so it does no geometry.
import type { PermitZones } from './permit-zones.ts';

type Ring = number[][];

export interface ZoneIsolation {
  /** [west, south, east, north] over every part of the zone. */
  bounds: [number, number, number, number];
  /** The world rectangle with the zone cut out. A zone's own holes come back as islands, so they are dimmed too. */
  mask: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

export interface PermitZoneBounds {
  city_id: string;
  zones: Record<string, ZoneIsolation>;
}

/** The outer ring of every mask: the Web Mercator world, wound counter-clockwise. */
export const WORLD_RECT: Ring = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

/** A zone's polygons, each as its rings (outer ring first, then holes). */
function polygonsOf(zone: PermitZones['features'][number]): Ring[][] {
  const c = zone.geometry.coordinates;
  return Array.isArray(c[0]?.[0]?.[0]) ? (c as Ring[][]) : [c as Ring[]];
}

/** Keeps the rectangle's winding for the outer ring and reverses the cut-out rings, as GeoJSON holes are. */
const asHole = (ring: Ring): Ring => (signedArea(ring) > 0 ? [...ring].reverse() : ring);

function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return sum / 2;
}

export function buildPermitZoneBounds(cityId: string, zones: PermitZones): PermitZoneBounds {
  const out: Record<string, ZoneIsolation> = {};
  for (const zone of zones.features) {
    const polygons = polygonsOf(zone);
    const points = polygons.flatMap((rings) => rings[0]);
    const bounds: ZoneIsolation['bounds'] = [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
      Math.max(...points.map((p) => p[0])),
      Math.max(...points.map((p) => p[1])),
    ];
    const islands = polygons.flatMap((rings) => rings.slice(1).map((ring) => [[...ring]]));
    const outside: Ring[] = [WORLD_RECT, ...polygons.map((rings) => asHole(rings[0]))];
    out[zone.properties.permit_code] = {
      bounds,
      mask: islands.length === 0 ? { type: 'Polygon', coordinates: outside } : { type: 'MultiPolygon', coordinates: [outside, ...islands] },
    };
  }
  return { city_id: cityId, zones: out };
}
