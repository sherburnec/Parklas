// Band geometry flags (task M2-8, spike decisions 2, 3 and 4). Pure logic, no file I/O: one pass over the
// node graph of the frozen segments file gives, per segment, how far to cut each band at both ends, whether
// the block is a sliver, and which sides face another block closely (inner). The layers only read the result.
import type { SegmentCollection } from './segments.ts';

/** config/band-geometry.json: read by this script and by the layers. */
export interface BandConfig {
  first_offset_px: number;
  offset_step_px: number;
  width_px: number;
  min_width_px: number;
  band_count: number;
  metres_per_px_z17: number;
  trim_cap_share: number;
  sliver_max_m: number;
  inner_max_distance_m: number;
  inner_max_angle_deg: number;
}

export interface SegmentTrim {
  trim_start_m: number;
  trim_end_m: number;
  sliver: boolean;
  inner_L: boolean;
  inner_R: boolean;
}

export interface TrimData {
  city_id: string;
  segments: Record<string, SegmentTrim>;
}

/** Distance in metres from the centerline to the outer edge of the outermost band, at z17. */
export function bandReachMetres(config: BandConfig): number {
  const outerOffsetPx = config.first_offset_px + config.offset_step_px * (config.band_count - 1);
  const drawnWidthPx = Math.max(config.min_width_px, config.width_px);
  return (outerOffsetPx + drawnWidthPx / 2) * config.metres_per_px_z17;
}

type Vec = [number, number];

const M_PER_DEG_LAT = 111_320;
const DEG = Math.PI / 180;
/** How far from the node the direction of a block end is read, so a curve right at the node does not decide it. */
const END_DIRECTION_M = 10;
/** Spacing of the points taken along a block when looking for close neighbours. */
const SAMPLE_STEP_M = 1;
/** A neighbour closer than this to the centerline is on the line, not on a side of it. */
const SIDE_EPSILON_M = 0.25;
const EPS = 1e-6;

interface Line {
  id: string;
  pts: Vec[];
  /** Cumulative length at each vertex. */
  at: number[];
  length: number;
  sliver: boolean;
  bbox: [number, number, number, number];
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const norm = (a: Vec): Vec => {
  const n = Math.hypot(a[0], a[1]);
  return n === 0 ? [0, 0] : [a[0] / n, a[1] / n];
};
const angleBetween = (a: Vec, b: Vec) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
const round2 = (n: number) => Math.round(n * 100) / 100;

function pointAt(line: Line, d: number): Vec {
  const { pts, at } = line;
  for (let i = 1; i < pts.length; i++) {
    if (at[i] >= d || i === pts.length - 1) {
      const span = at[i] - at[i - 1];
      const f = span === 0 ? 0 : Math.min(1, (d - at[i - 1]) / span);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
    }
  }
  return pts[pts.length - 1];
}

/** Unit direction leaving the block's end, pointing into the block. */
function endDirection(line: Line, atStart: boolean): Vec {
  const reach = Math.min(END_DIRECTION_M, line.length);
  if (atStart) return norm(sub(pointAt(line, reach), line.pts[0]));
  return norm(sub(pointAt(line, line.length - reach), line.pts[line.pts.length - 1]));
}

/**
 * Which of a block's sides, left or right facing along it, have another block close beside them.
 * Samples the other block every metre; a sample counts when it lies within `maxDistance` of the centerline,
 * strictly between the block's two ends (so a block that continues past an end, or meets it at a right angle,
 * is not beside it), off the line by more than a hair, and heading within `maxAngle` of parallel.
 */
function innerSides(line: Line, others: Line[], maxDistance: number, maxAngle: number): { L: boolean; R: boolean } {
  const found = { L: false, R: false };
  const cosLimit = Math.cos(maxAngle * DEG);
  const [x0, y0, x1, y1] = line.bbox;
  for (const other of others) {
    const [a0, b0, a1, b1] = other.bbox;
    if (a1 < x0 - maxDistance || a0 > x1 + maxDistance || b1 < y0 - maxDistance || b0 > y1 + maxDistance) continue;
    for (let i = 1; i < other.pts.length; i++) {
      const from = other.pts[i - 1];
      const to = other.pts[i];
      const span = other.at[i] - other.at[i - 1];
      if (span === 0) continue;
      const heading = norm(sub(to, from));
      const steps = Math.max(1, Math.ceil(span / SAMPLE_STEP_M));
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const p: Vec = [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
        const hit = locate(line, p);
        if (!hit || hit.distance > maxDistance + EPS || hit.distance <= SIDE_EPSILON_M) continue;
        if (Math.abs(dot(hit.heading, heading)) < cosLimit - EPS) continue;
        found[hit.left ? 'L' : 'R'] = true;
      }
      if (found.L && found.R) return found;
    }
  }
  return found;
}

/** Where `p` falls beside `line`: null unless it projects strictly inside the line's length. */
function locate(line: Line, p: Vec): { distance: number; left: boolean; heading: Vec } | null {
  let best: { distance: number; left: boolean; heading: Vec } | null = null;
  const { pts, at } = line;
  for (let i = 1; i < pts.length; i++) {
    const d = sub(pts[i], pts[i - 1]);
    const span = at[i] - at[i - 1];
    if (span === 0) continue;
    const heading: Vec = [d[0] / span, d[1] / span];
    const v = sub(p, pts[i - 1]);
    const along = dot(v, heading);
    if (along < 0 || along > span) continue;
    const t = at[i - 1] + along;
    if (t <= EPS || t >= line.length - EPS) continue;
    const side = cross(heading, v);
    const distance = Math.abs(side);
    if (!best || distance < best.distance) best = { distance, left: side > 0, heading };
  }
  return best;
}

export function buildTrim(segments: SegmentCollection, config: BandConfig): TrimData {
  const features = segments.features;
  const coordCount = features.reduce((n, f) => n + f.geometry.coordinates.length, 0);
  const meanLat = coordCount === 0 ? 0 : features.reduce((n, f) => n + f.geometry.coordinates.reduce((m, c) => m + c[1], 0), 0) / coordCount;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos(meanLat * DEG);

  // Pass 1: geometry in metres, and the sliver flag, before anything else looks at a neighbour.
  const lines: Line[] = features.map((f) => {
    const pts: Vec[] = f.geometry.coordinates.map(([lon, lat]) => [lon * mPerDegLon, lat * M_PER_DEG_LAT]);
    const at = [0];
    for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const length = at[at.length - 1];
    return {
      id: f.properties.segment_id,
      pts,
      at,
      length,
      sliver: length < config.sliver_max_m,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    };
  });

  // Pass 2: the node graph. Slivers stay in it but do not count as neighbours below.
  interface End {
    line: Line;
    atStart: boolean;
    dir: Vec;
  }
  const nodes = new Map<string, End[]>();
  features.forEach((f, i) => {
    const c = f.geometry.coordinates;
    const ends: [string, boolean][] = [
      [`${c[0][0]},${c[0][1]}`, true],
      [`${c[c.length - 1][0]},${c[c.length - 1][1]}`, false],
    ];
    for (const [key, atStart] of ends) {
      const list = nodes.get(key) ?? [];
      list.push({ line: lines[i], atStart, dir: endDirection(lines[i], atStart) });
      nodes.set(key, list);
    }
  });

  const reach = bandReachMetres(config);
  const solid = lines.filter((l) => !l.sliver);
  const out: Record<string, SegmentTrim> = {};

  features.forEach((f, i) => {
    const line = lines[i];
    const c = f.geometry.coordinates;
    const cap = config.trim_cap_share * line.length;
    const trimAt = (key: string, atStart: boolean): number => {
      let theta = Infinity;
      for (const other of nodes.get(key) ?? []) {
        if (other.line.sliver || (other.line === line && other.atStart === atStart)) continue;
        theta = Math.min(theta, angleBetween(endDirection(line, atStart), other.dir));
      }
      if (theta === Infinity) return 0;
      const wanted = theta < EPS ? Infinity : reach / Math.tan(theta / 2);
      return round2(Math.min(wanted, cap));
    };
    const inner = innerSides(
      line,
      solid.filter((o) => o !== line),
      config.inner_max_distance_m,
      config.inner_max_angle_deg,
    );
    out[line.id] = {
      trim_start_m: trimAt(`${c[0][0]},${c[0][1]}`, true),
      trim_end_m: trimAt(`${c[c.length - 1][0]},${c[c.length - 1][1]}`, false),
      sliver: line.sliver,
      inner_L: inner.L,
      inner_R: inner.R,
    };
  });

  return { city_id: features[0]?.properties.city_id ?? '', segments: out };
}
