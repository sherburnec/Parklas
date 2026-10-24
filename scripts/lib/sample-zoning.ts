// Pure logic for the sample zoning polygons (task TD-3). No file I/O here: the CLI reads and writes the files.
//
// A grid of rectangles that tile the whole city. Each cut line is snapped to a real street, so a cell is
// a group of whole blocks, not a parcel. Neighbouring cells share the exact same cut numbers, so there
// are no gaps and no overlaps. The outer edge sits a little past the outermost streets.
import type { SegmentCollection } from './build.ts';
import { bboxOf } from './sample-data.ts';

export const ZONING_CATEGORIES = {
  residential: { label: 'Residential', hex: '#F4D35E' },
  commercial: { label: 'Commercial', hex: '#EE6C4D' },
  industrial: { label: 'Industrial', hex: '#8D99AE' },
  mixed_use: { label: 'Mixed use', hex: '#B56576' },
  open_space: { label: 'Open space', hex: '#6A994E' },
  public: { label: 'Public', hex: '#4D7EA8' },
};

/** SAMPLE-C1 and SAMPLE-C2 share a category, to exercise the code-to-category map. */
export const ZONING_CODES: Record<string, keyof typeof ZONING_CATEGORIES> = {
  'SAMPLE-R1': 'residential',
  'SAMPLE-C1': 'commercial',
  'SAMPLE-C2': 'commercial',
  'SAMPLE-MU': 'mixed_use',
  'SAMPLE-M1': 'industrial',
  'SAMPLE-OS': 'open_space',
  'SAMPLE-P': 'public',
};

const ZONE_NAMES: Record<string, string> = {
  'SAMPLE-R1': 'Sample residential',
  'SAMPLE-C1': 'Sample commercial 1',
  'SAMPLE-C2': 'Sample commercial 2',
  'SAMPLE-MU': 'Sample mixed use',
  'SAMPLE-M1': 'Sample industrial',
  'SAMPLE-OS': 'Sample open space',
  'SAMPLE-P': 'Sample public',
};

// Zone code of each cell, north row first, west column first. 5 columns x 4 rows.
const ZONE_GRID = [
  ['SAMPLE-R1', 'SAMPLE-OS', 'SAMPLE-R1', 'SAMPLE-MU', 'SAMPLE-R1'],
  ['SAMPLE-P', 'SAMPLE-C1', 'SAMPLE-R1', 'SAMPLE-C2', 'SAMPLE-M1'],
  ['SAMPLE-R1', 'SAMPLE-MU', 'SAMPLE-R1', 'SAMPLE-OS', 'SAMPLE-R1'],
  ['SAMPLE-M1', 'SAMPLE-R1', 'SAMPLE-C2', 'SAMPLE-P', 'SAMPLE-C1'],
];
const EDGE_MARGIN = 0.002; // degrees (about 200 m) past the outermost street

/** The street coordinate (x for north-south streets, y for east-west) nearest each target. */
function snapCuts(values: number[], targets: number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return targets.map((t) => sorted.reduce((best, v) => (Math.abs(v - t) < Math.abs(best - t) ? v : best)));
}

export function zoningCuts(segments: SegmentCollection, cols: number, rows: number): { xs: number[]; ys: number[] } {
  const [minX, minY, maxX, maxY] = bboxOf(segments);
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (const f of segments.features) {
    const c = f.geometry.coordinates;
    const [x0, y0] = c[0];
    const [x1, y1] = c[c.length - 1];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (dy > dx * 4) vertical.push(Math.round(((x0 + x1) / 2) * 1e6) / 1e6);
    else if (dx > dy * 4) horizontal.push(Math.round(((y0 + y1) / 2) * 1e6) / 1e6);
  }
  const inner = (min: number, max: number, n: number) => Array.from({ length: n - 1 }, (_, i) => min + ((max - min) * (i + 1)) / n);
  const xs = [...new Set(snapCuts(vertical, inner(minX, maxX, cols)))];
  const ys = [...new Set(snapCuts(horizontal, inner(minY, maxY, rows)))];
  return { xs: [minX - EDGE_MARGIN, ...xs, maxX + EDGE_MARGIN], ys: [minY - EDGE_MARGIN, ...ys, maxY + EDGE_MARGIN] };
}

export type ZoningCollection = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: { zone_code: string; category: string; name: string; city_id: string };
    geometry: { type: 'Polygon'; coordinates: number[][][] };
  }[];
};

export function generateZoning(segments: SegmentCollection, cityId: string): ZoningCollection {
  const { xs, ys } = zoningCuts(segments, ZONE_GRID[0].length, ZONE_GRID.length);
  if (xs.length - 1 !== ZONE_GRID[0].length || ys.length - 1 !== ZONE_GRID.length) {
    throw new Error('Street snapping merged two cut lines; the segments do not look like a grid');
  }
  const features: ZoningCollection['features'] = [];
  ZONE_GRID.forEach((rowCodes, r) => {
    rowCodes.forEach((code, c) => {
      const [w, e] = [xs[c], xs[c + 1]];
      const [n, s] = [ys[ys.length - 1 - r], ys[ys.length - 2 - r]]; // row 0 is the northernmost
      features.push({
        type: 'Feature',
        properties: { zone_code: code, category: ZONING_CODES[code], name: `${ZONE_NAMES[code]} (${r + 1},${c + 1})`, city_id: cityId },
        geometry: { type: 'Polygon', coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]]] },
      });
    });
  });
  return { type: 'FeatureCollection', features };
}

export function zoningConfig(cityId: string) {
  return { city_id: cityId, categories: ZONING_CATEGORIES, zone_codes: ZONING_CODES };
}

/** One feature per line, like the hand-made file, so diffs stay readable. */
export function zoningToJson(z: ZoningCollection): string {
  return `{"type":"FeatureCollection","features":[\n${z.features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}
