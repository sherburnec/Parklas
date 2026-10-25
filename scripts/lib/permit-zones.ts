// Permit zone assignment and checks (task M2-9). Pure logic, no file I/O.
//
// Zones follow street lines, so a street on a zone border has a different zone on each side. A side is therefore
// tested by a point just off the block, toward that side, never by the street line itself.
import type { Side } from './side-offset.ts';

type Line = number[][];

export interface PermitZones {
  features: {
    properties: { permit_code: string };
    geometry: { coordinates: number[][][] | number[][][][] };
  }[];
}

const SIDE_OFFSET_M = 4;
const END_FRACTION = 0.1; // how far in from each end a block's end is tested
const M_PER_DEG_X = 92000; // Burbank's latitude
const M_PER_DEG_Y = 111000;
const ON_EDGE = 1e-10; // degrees; closer than this to an edge counts as on the border

/**
 * A point just off a block, toward one side, at a fraction of its length (the middle by default). L is to the left
 * when facing from the first to the last coordinate.
 */
export function sidePointAt(line: Line, side: Side, fraction = 0.5): [number, number] {
  const lengths = line.slice(1).map((p, i) => Math.hypot((p[0] - line[i][0]) * M_PER_DEG_X, (p[1] - line[i][1]) * M_PER_DEG_Y));
  let left = lengths.reduce((a, b) => a + b, 0) * fraction;
  let i = 0;
  while (i < lengths.length - 1 && left > lengths[i]) left -= lengths[i++];
  const t = lengths[i] === 0 ? 0 : left / lengths[i];
  const [x0, y0] = line[i];
  const [x1, y1] = line[i + 1];
  const dx = (x1 - x0) * M_PER_DEG_X;
  const dy = (y1 - y0) * M_PER_DEG_Y;
  const len = Math.hypot(dx, dy) || 1;
  const sign = side === 'L' ? 1 : -1;
  return [
    x0 + (x1 - x0) * t + (sign * (-dy / len) * SIDE_OFFSET_M) / M_PER_DEG_X,
    y0 + (y1 - y0) * t + (sign * (dx / len) * SIDE_OFFSET_M) / M_PER_DEG_Y,
  ];
}

/** A polygon as its rings: the outer ring first, then any holes. */
function polygonsOf(zone: PermitZones['features'][number]): number[][][][] {
  const c = zone.geometry.coordinates;
  return Array.isArray(c[0]?.[0]?.[0]) ? (c as number[][][][]) : [c as number[][][]];
}

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPolygon = (x: number, y: number, rings: number[][][]) => inRing(x, y, rings[0]) && !rings.slice(1).some((h) => inRing(x, y, h));

function distanceToEdge(x: number, y: number, a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

const onBorder = (x: number, y: number, rings: number[][][]) =>
  rings.some((ring) => ring.some((p, i) => i > 0 && distanceToEdge(x, y, ring[i - 1], p) < ON_EDGE));

/** Inside and not on the border: sharing an edge with another zone is allowed, sharing area is not. */
const strictlyIn = (x: number, y: number, rings: number[][][]) => inPolygon(x, y, rings) && !onBorder(x, y, rings);

/** The code of the first zone holding a point, or null. */
function zoneCodeAt(x: number, y: number, zones: PermitZones): string | null {
  for (const z of zones.features) if (polygonsOf(z).some((rings) => inPolygon(x, y, rings))) return z.properties.permit_code;
  return null;
}

/** The permit zone one side of a block lies in, or null if it lies outside every zone. */
export function permitZoneAt(line: Line, side: Side, zones: PermitZones): string | null {
  const [x, y] = sidePointAt(line, side);
  return zoneCodeAt(x, y, zones);
}

/** The permit zone one side of a block lies in near each of its two ends. */
export function permitZonesAtEnds(line: Line, side: Side, zones: PermitZones): { start: string | null; end: string | null } {
  const at = (fraction: number) => zoneCodeAt(...sidePointAt(line, side, fraction), zones);
  return { start: at(END_FRACTION), end: at(1 - END_FRACTION) };
}

function crosses(a: number[], b: number[], c: number[], d: number[]): boolean {
  const side = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

// Fractions across a band or a stretch. Several, so a sample point is unlikely to land exactly on another zone's border.
const SPREAD = [0.25, 0.5, 0.75];

/** Points inside a polygon: along horizontal lines between vertex heights, inside each stretch the line spends in the polygon. */
function interiorPoints(rings: number[][][]): [number, number][] {
  const ys = [...new Set(rings[0].map((p) => p[1]))].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let k = 1; k < ys.length; k++) {
    for (const fy of SPREAD) {
      const y = ys[k - 1] + (ys[k] - ys[k - 1]) * fy;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 1; i < ring.length; i++) {
          const [a, b] = [ring[i - 1], ring[i]];
          if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (const fx of SPREAD) out.push([xs[i] + (xs[i + 1] - xs[i]) * fx, y]);
    }
  }
  return out;
}

function polygonsOverlap(a: number[][][], b: number[][][]): boolean {
  for (let i = 1; i < a[0].length; i++) {
    for (let j = 1; j < b[0].length; j++) if (crosses(a[0][i - 1], a[0][i], b[0][j - 1], b[0][j])) return true;
  }
  const holds = (outer: number[][][], inner: number[][][]) =>
    inner[0].some(([x, y]) => strictlyIn(x, y, outer)) || interiorPoints(inner).some(([x, y]) => strictlyIn(x, y, outer));
  return holds(a, b) || holds(b, a);
}

/** Every pair of zones (by position in the file, first before second) that share area. Zones that only share a border are fine. */
export function findOverlaps(zones: PermitZones): { first: number; second: number }[] {
  const polys = zones.features.map(polygonsOf);
  const found: { first: number; second: number }[] = [];
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (polys[i].some((a) => polys[j].some((b) => polygonsOverlap(a, b)))) found.push({ first: i, second: j });
    }
  }
  return found;
}
