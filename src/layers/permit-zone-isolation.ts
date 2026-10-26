// Isolating one permit zone (task M5-9). No geometry here: the bounds and the outside-the-zone mask were worked
// out by the build script.
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { PermitZoneBounds } from '../data-loader';

export interface ZoneIsolation {
  code: string;
  /** [west, south, east, north]. */
  bounds: [number, number, number, number];
  mask: Polygon | MultiPolygon;
}

/** The isolation for a zone filter value, or null for All, No zone, a code with no bounds, or a city with none. */
export function isolationFor(zone: string, bounds: PermitZoneBounds | null): ZoneIsolation | null {
  const entry = zone === 'all' || zone === 'none' ? undefined : bounds?.zones[zone];
  return entry ? { code: zone, bounds: entry.bounds, mask: entry.mask } : null;
}

/** A MapLibre filter showing only this zone's polygon, or null to show every polygon. */
export function zoneShownFilter(code: string | null): ['==', ['get', string], string] | null {
  return code === null ? null : ['==', ['get', 'permit_code'], code];
}

/** The dimming mask as map data: empty when nothing is isolated. */
export function maskCollection(isolation: ZoneIsolation | null): FeatureCollection<Polygon | MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: isolation ? [{ type: 'Feature', properties: {}, geometry: isolation.mask }] : [],
  };
}
