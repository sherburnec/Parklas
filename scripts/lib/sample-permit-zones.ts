// Pure logic for the sample permit zones (tasks TD-8, TD-8.2). No file I/O here: the CLI reads and writes the files.
//
// Eight zones, DEMO-A to DEMO-H, tile the whole city: every point, so every side of every block, lies in exactly one
// zone. The tiling is a 4 x 2 grid built like the zoning one: cut lines snapped to real streets and placed so each zone
// holds a similar number of blocks. The borders stay straight. The streets run about 45 degrees off the grid, so some blocks
// have their two ends in different zones; the validator warns about those.
// Zones are lettered in reading order: north row first, west to east.
import type { SegmentCollection } from './build.ts';
import { mulberry32, SAMPLE_SEED } from './sample-data.ts';
import { tileCity } from './sample-zoning.ts';

const ZONE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLS = 4;
const ROWS = 2;

export type PermitZoneFeatureCollection = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: { permit_code: string; name: string; city_id: string };
    geometry: { type: 'Polygon'; coordinates: number[][][] };
  }[];
};

/** Eight non-overlapping zones DEMO-A to DEMO-H that together cover the whole city. */
export function generatePermitZones(segments: SegmentCollection, cityId: string, seed = SAMPLE_SEED): PermitZoneFeatureCollection {
  const rings = tileCity(segments, COLS, ROWS, mulberry32((seed ^ 0x5a4f4e45) >>> 0), true, 0).flat();
  const features = rings.map((ring, zone): PermitZoneFeatureCollection['features'][number] => ({
    type: 'Feature',
    properties: { permit_code: `DEMO-${ZONE_LETTERS[zone]}`, name: `Demo permit zone ${ZONE_LETTERS[zone]}`, city_id: cityId },
    geometry: { type: 'Polygon', coordinates: [ring] },
  }));
  return { type: 'FeatureCollection', features };
}

/** One feature per line, like the hand-made file, so diffs stay readable. */
export function permitZonesToJson(z: PermitZoneFeatureCollection): string {
  return `{"type":"FeatureCollection","features":[\n${z.features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}
