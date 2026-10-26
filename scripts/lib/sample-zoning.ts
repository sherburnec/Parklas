// Pure logic for the sample zoning polygons (task TD-3). No file I/O here: the CLI reads and writes the files.
//
// A grid of cells that tile the whole city. Each grid line is snapped to a real street, then every inner
// edge between two cells is wiggled by a few seeded points. Both neighbours get the same points (one walks
// them backwards), so there are no gaps and no overlaps. The outer edge stays straight and sits a little
// past the outermost streets.
import type { SegmentCollection } from './build.ts';
import { bboxOf, mulberry32, SAMPLE_SEED } from './sample-data.ts';

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
const WIGGLE_AT = [0.2, 0.4, 0.6, 0.8]; // where along an inner edge a point is added
const WIGGLE_MAX = 0.12; // furthest a point moves sideways, as a share of the smaller neighbouring cell. Under 0.2, so edges never cross

/** The street coordinate (x for north-south streets, y for east-west) nearest each target. */
function snapCuts(values: number[], targets: number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return targets.map((t) => sorted.reduce((best, v) => (Math.abs(v - t) < Math.abs(best - t) ? v : best)));
}

/** Cut lines are spread evenly over the city's area, or, when balanced, so each strip holds about the same number of blocks. */
export function zoningCuts(segments: SegmentCollection, cols: number, rows: number, balanced = false): { xs: number[]; ys: number[] } {
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
  const middles = segments.features.map((f) => f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)]);
  const quantiles = (values: number[], n: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return Array.from({ length: n - 1 }, (_, i) => sorted[Math.floor((sorted.length * (i + 1)) / n)]);
  };
  const inner = (min: number, max: number, n: number, axis: 0 | 1) =>
    balanced ? quantiles(middles.map((m) => m[axis]), n) : Array.from({ length: n - 1 }, (_, i) => min + ((max - min) * (i + 1)) / n);
  const xs = [...new Set(snapCuts(vertical, inner(minX, maxX, cols, 0)))];
  const ys = [...new Set(snapCuts(horizontal, inner(minY, maxY, rows, 1)))];
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

type Pt = [number, number];
const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

/** One cell of a tiling: a closed ring. */
export type Ring = Pt[];

/**
 * Tiles the whole city with cols x rows cells (rings[row][col], row 0 northernmost). Cut lines are snapped to real streets and
 * every inner edge is wiggled by seeded points that both neighbours share, so there are no gaps and no overlaps.
 * Balanced cuts give cells with about the same number of blocks, rather than the same area. A wiggle of 0 leaves the borders straight.
 */
export function tileCity(segments: SegmentCollection, cols: number, rows: number, rng: () => number, balanced = false, wiggle = WIGGLE_MAX): Ring[][] {
  const { xs, ys } = zoningCuts(segments, cols, rows, balanced);
  if (xs.length - 1 !== cols || ys.length - 1 !== rows) {
    throw new Error('Street snapping merged two cut lines; the segments do not look like a grid');
  }
  const width = (i: number) => xs[i + 1] - xs[i];
  const height = (j: number) => ys[j + 1] - ys[j];
  const sideways = (a: number, b: number) => (rng() * 2 - 1) * wiggle * Math.min(a, b);

  // h[j][i]: points strictly between corners (i, j) and (i + 1, j), west to east. v[i][j]: between (i, j) and (i, j + 1), south to north.
  const h = ys.map((y, j) =>
    Array.from({ length: xs.length - 1 }, (_, i): Pt[] => {
      if (j === 0 || j === ys.length - 1) return [];
      return WIGGLE_AT.map((t) => [round7(xs[i] + t * width(i)), round7(y + sideways(height(j - 1), height(j)))]);
    }),
  );
  const v = xs.map((x, i) =>
    Array.from({ length: ys.length - 1 }, (_, j): Pt[] => {
      if (i === 0 || i === xs.length - 1) return [];
      return WIGGLE_AT.map((t) => [round7(x + sideways(width(i - 1), width(i))), round7(ys[j] + t * height(j))]);
    }),
  );

  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c): Ring => {
      const jn = ys.length - 1 - r; // row 0 is the northernmost
      const js = jn - 1;
      const nw: Pt = [xs[c], ys[jn]];
      const ne: Pt = [xs[c + 1], ys[jn]];
      const se: Pt = [xs[c + 1], ys[js]];
      const sw: Pt = [xs[c], ys[js]];
      return [nw, ...h[jn][c], ne, ...[...v[c + 1][js]].reverse(), se, ...[...h[js][c]].reverse(), sw, ...v[c][js], nw];
    }),
  );
}

export function generateZoning(segments: SegmentCollection, cityId: string): ZoningCollection {
  const rings = tileCity(segments, ZONE_GRID[0].length, ZONE_GRID.length, mulberry32(SAMPLE_SEED));
  const features: ZoningCollection['features'] = [];
  ZONE_GRID.forEach((rowCodes, r) => {
    rowCodes.forEach((code, c) => {
      features.push({
        type: 'Feature',
        properties: { zone_code: code, category: ZONING_CODES[code], name: `${ZONE_NAMES[code]} (${r + 1},${c + 1})`, city_id: cityId },
        geometry: { type: 'Polygon', coordinates: [rings[r][c]] },
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
