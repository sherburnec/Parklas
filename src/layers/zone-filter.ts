// Zone filter (task M4-5): limits a rule layer to the sides whose build-time `permit_zone` matches the chosen zone.
// No geometry here: the zone was worked out from the polygons by the build script.
import type { SideCollection } from '../data-loader';

/**
 * `zone` is 'all' (or absent) for every side, 'none' for sides outside every permit zone, or a permit code.
 * Returns the same collection when nothing is filtered.
 */
export function filterByZone(sides: SideCollection, zone: string | undefined): SideCollection {
  if (zone === undefined || zone === 'all') return sides;
  const keep = (f: SideCollection['features'][number]): boolean => {
    const own = f.properties.permit_zone;
    return zone === 'none' ? own === null || own === undefined : own === zone;
  };
  return { ...sides, features: sides.features.filter(keep) };
}
