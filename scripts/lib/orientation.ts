// Pure logic for drawing every block in a consistent city-grid direction (task M5-6). No I/O here.
//
// L and R are read facing along a block, so a street whose blocks all point the same way keeps its L curb on the
// same side from end to end. The rule:
// - The base street (Olive Avenue in Burbank) runs outward from the origin in both directions.
// - North/South streets run outward from the base street: toward city north on its north side, south on its south.
// - Every other East/West street runs like the base street: outward from the east-west divider through the origin.
// Only the direction changes; ids, names and coordinates are kept, and reversed blocks swap from_street and to_street.
import type { SegmentCollection, SegmentFeature } from './segments.ts';

export interface CityGrid {
  /** Where the base street splits into its east and west halves, as [lon, lat]. */
  origin: [number, number];
  /** Compass bearing of city east, along the base street at the origin, in degrees. */
  eastBearing: number;
  /** Street names that make up the base street. Its blocks are always East/West. */
  baseStreets: string[];
}

/**
 * Burbank: the origin is the node where West Olive Avenue becomes East Olive Avenue, beside the North/South Front
 * Street split (just south of Front Street). City east is Olive's bearing there; East/West Alameda splits on the
 * same divider. Olive Avenue Frontage and Olive Avenue Metro Lot are side roads, not part of the base.
 */
export const BURBANK_GRID: CityGrid = {
  origin: [-118.3112812, 34.1785161],
  eastBearing: 41.4,
  baseStreets: ['Olive Avenue', 'East Olive Avenue', 'West Olive Avenue'],
};

export type GridAxis = 'ns' | 'ew';

/** A block's axis, and the half of the city it sits in: +1 north or east, -1 south or west. */
export interface GridClass {
  axis: GridAxis;
  side: 1 | -1;
}

const PREFIX_SIDE: Record<string, GridClass> = {
  North: { axis: 'ns', side: 1 },
  South: { axis: 'ns', side: -1 },
  East: { axis: 'ew', side: 1 },
  West: { axis: 'ew', side: -1 },
};

/** How many nearby prefixed blocks set the local grid angle for an unprefixed street with no prefixed namesake. */
const NEIGHBOURS = 6;

const M_PER_DEG = 111_320;

type Point = [number, number];

const splitName = (street: string): { prefix: string | null; base: string } => {
  const space = street.indexOf(' ');
  const first = street.slice(0, space);
  return space > 0 && first in PREFIX_SIDE ? { prefix: first, base: street.slice(space + 1) } : { prefix: null, base: street };
};

const isLoop = (line: number[][]) => line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];

/**
 * Classify every block that has a direction (closed loops are left out). In order of trust: the street's own
 * North/South/East/West prefix; for an unprefixed street, the axis most of its prefixed namesake's blocks have
 * ("Victory Boulevard" next to "North Victory Boulevard"); otherwise the angle of the nearest prefixed blocks,
 * since the grid turns across the city. An unprefixed block's side comes from where it lies: which side of the
 * base street for North/South, which side of the divider for East/West.
 */
export function classifySegments(fc: SegmentCollection, grid: CityGrid): Map<string, GridClass> {
  const cosLat = Math.cos((grid.origin[1] * Math.PI) / 180);
  const toXY = ([lon, lat]: number[]): Point => [(lon - grid.origin[0]) * M_PER_DEG * cosLat, (lat - grid.origin[1]) * M_PER_DEG];
  const b = (grid.eastBearing * Math.PI) / 180;
  const east: Point = [Math.sin(b), Math.cos(b)];
  const north: Point = [-east[1], east[0]];
  const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];

  const blocks = fc.features
    .filter((f) => !isLoop(f.geometry.coordinates))
    .map((f) => {
      const line = f.geometry.coordinates.map(toXY);
      const [a, z] = [line[0], line[line.length - 1]];
      return { f, line, chord: [z[0] - a[0], z[1] - a[1]] as Point, mid: [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2] as Point, ...splitName(f.properties.street) };
    });
  const isBase = (street: string) => grid.baseStreets.includes(street);

  // The base street is taken as a straight line through the origin along city east, and the divider as the line
  // across it. Burbank's Olive Avenue bends only at its far southwest end; a straight line agrees with more of the
  // North/South name prefixes than Olive's own line does.
  const sideFor = (axis: GridAxis, mid: Point): 1 | -1 => (dot(mid, axis === 'ns' ? north : east) >= 0 ? 1 : -1);

  const prefixed = blocks.filter((x) => x.prefix !== null);
  const namesake = new Map<string, number>(); // base name -> (ns blocks - ew blocks)
  for (const x of prefixed) namesake.set(x.base, (namesake.get(x.base) ?? 0) + (PREFIX_SIDE[x.prefix!].axis === 'ns' ? 1 : -1));

  // City east near a point, from the nearest prefixed blocks: an axial mean, so a block's own direction does not count.
  const localEast = (pt: Point): Point => {
    const near = prefixed
      .map((x) => ({ x, d: Math.hypot(x.mid[0] - pt[0], x.mid[1] - pt[1]) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, NEIGHBOURS);
    if (near.length === 0) return east;
    let [c, s] = [0, 0];
    for (const { x } of near) {
      const theta = Math.atan2(x.chord[1], x.chord[0]) - (PREFIX_SIDE[x.prefix!].axis === 'ns' ? Math.PI / 2 : 0);
      c += Math.cos(2 * theta);
      s += Math.sin(2 * theta);
    }
    const phi = Math.atan2(s, c) / 2;
    return [Math.cos(phi), Math.sin(phi)];
  };

  // Blocks left to the local grid are judged one by one, then each connected run of one street takes the axis most
  // of its length has, so a kink does not flip part of a street.
  const byAngle = blocks.filter((x) => x.prefix === null && !isBase(x.f.properties.street) && !(namesake.get(x.base) ?? 0));
  const vote = new Map<string, number>(); // run key -> (ns length - ew length)
  const runOf = new Map<string, string>();
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    while (parent.get(k) !== k) k = parent.get(k)!;
    return k;
  };
  const endKeys = (x: (typeof blocks)[number]) => {
    const c = x.f.geometry.coordinates;
    return [`${x.base}|${c[0].join()}`, `${x.base}|${c[c.length - 1].join()}`];
  };
  for (const x of byAngle) for (const k of endKeys(x)) if (!parent.has(k)) parent.set(k, k);
  for (const x of byAngle) {
    const [a, z] = endKeys(x).map(find);
    if (a !== z) parent.set(a, z);
  }
  for (const x of byAngle) {
    const e = localEast(x.mid);
    const n: Point = [-e[1], e[0]];
    const [along, across] = [Math.abs(dot(x.chord, e)), Math.abs(dot(x.chord, n))];
    const run = find(endKeys(x)[0]);
    runOf.set(x.f.properties.segment_id, run);
    vote.set(run, (vote.get(run) ?? 0) + (across > along ? 1 : -1) * Math.hypot(...x.chord));
  }

  const out = new Map<string, GridClass>();
  for (const x of blocks) {
    let axis: GridAxis;
    if (x.prefix !== null && !isBase(x.f.properties.street)) {
      out.set(x.f.properties.segment_id, PREFIX_SIDE[x.prefix]);
      continue;
    } else if (isBase(x.f.properties.street)) {
      axis = 'ew';
    } else if (namesake.get(x.base)) {
      axis = namesake.get(x.base)! > 0 ? 'ns' : 'ew';
    } else {
      axis = vote.get(runOf.get(x.f.properties.segment_id)!)! > 0 ? 'ns' : 'ew';
    }
    const side = x.prefix !== null ? PREFIX_SIDE[x.prefix].side : sideFor(axis, x.mid);
    out.set(x.f.properties.segment_id, { axis, side });
  }
  return out;
}

const reverse = (f: SegmentFeature): SegmentFeature => ({
  ...f,
  properties: { ...f.properties, from_street: f.properties.to_street, to_street: f.properties.from_street },
  geometry: { ...f.geometry, coordinates: [...f.geometry.coordinates].reverse() },
});

/**
 * Point every block outward along the city grid: an East/West block toward city east on the east side of the
 * divider and toward city west on the west side, a North/South block likewise either side of the base street.
 * Measured along the grid at the origin, which every part of the city is within 50 degrees of.
 * Returns a new collection in the same order and the sorted ids of the blocks it reversed.
 */
export function orientSegments(fc: SegmentCollection, grid: CityGrid): { collection: SegmentCollection; reversed: string[] } {
  const classes = classifySegments(fc, grid);
  const cosLat = Math.cos((grid.origin[1] * Math.PI) / 180);
  const b = (grid.eastBearing * Math.PI) / 180;
  const reversed: string[] = [];
  const features = fc.features.map((f) => {
    const cls = classes.get(f.properties.segment_id);
    if (!cls) return f;
    const line = f.geometry.coordinates;
    const dx = (line[line.length - 1][0] - line[0][0]) * cosLat;
    const dy = line[line.length - 1][1] - line[0][1];
    const along = cls.axis === 'ew' ? dx * Math.sin(b) + dy * Math.cos(b) : dy * Math.sin(b) - dx * Math.cos(b);
    if (along * cls.side >= 0) return f;
    reversed.push(f.properties.segment_id);
    return reverse(f);
  });
  return { collection: { ...fc, features }, reversed: reversed.sort() };
}
