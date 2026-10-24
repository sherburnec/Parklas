// Pure logic for the sample-data generator (task TD-2). No file I/O here: the CLI reads and writes the files.
//
// Picks about 1 in 15 segments, spread over the whole city, and gives each some made-up rules.
// Everything random comes from a seeded generator, so the same segments and seed give the same rows.
import { sideToOffset, type RuleRow, type SegmentCollection, type Side } from './build.ts';

export const SAMPLE_SEED = 20261023;
const ONE_IN = 15;
const PICK_GRID = 8; // the city is cut into 8 x 8 cells and each cell contributes its share, so picks cannot clump

type Rng = () => number;
type Segment = SegmentCollection['features'][number];
type Layer = RuleRow['layer'];
type Window = { days: string[]; start: string; end: string; weeks_of_month?: number[] };
type Schedule = { windows: Window[] } | null;

/** mulberry32: small, fast and identical on every machine. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bboxCache = new WeakMap<SegmentCollection, [number, number, number, number]>();

function bboxOf(segments: SegmentCollection): [number, number, number, number] {
  const cached = bboxCache.get(segments);
  if (cached) return cached;
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of segments.features) {
    for (const [x, y] of f.geometry.coordinates) box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
  }
  bboxCache.set(segments, box);
  return box;
}

/** Which cell of an n x n grid over the city a segment's middle falls in, as "col,row". */
export function cellOf(segment: Segment, segments: SegmentCollection, n: number): string {
  const [minX, minY, maxX, maxY] = bboxOf(segments);
  const line = segment.geometry.coordinates;
  const [x, y] = line[Math.floor(line.length / 2)];
  const col = Math.min(n - 1, Math.floor(((x - minX) / (maxX - minX)) * n));
  const row = Math.min(n - 1, Math.floor(((y - minY) / (maxY - minY)) * n));
  return `${col},${row}`;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** About 1 in 15 segments from each cell; the fractions carry over so the total stays close to 1 in 15. */
function pickSegments(segments: SegmentCollection, rng: Rng): Set<string> {
  const cells = new Map<string, string[]>();
  for (const f of segments.features) {
    const key = cellOf(f, segments, PICK_GRID);
    cells.set(key, [...(cells.get(key) ?? []), f.properties.segment_id]);
  }
  const picked = new Set<string>();
  let carry = 0;
  for (const key of [...cells.keys()].sort()) {
    const ids = cells.get(key)!.sort();
    const exact = ids.length / ONE_IN + carry;
    const quota = Math.floor(exact);
    carry = exact - quota;
    for (const id of shuffle(ids, rng).slice(0, quota)) picked.add(id);
  }
  return picked;
}

/** The two sides that fit the block's direction, the same test the build script applies. */
function sidesOf(segment: Segment): [Side, Side] {
  try {
    sideToOffset('N', segment.geometry.coordinates);
    return ['N', 'S'];
  } catch {
    return ['E', 'W'];
  }
}

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const chance = (p: number, rng: Rng) => rng() < p;
const win = (days: string[], start: string, end: string, weeks_of_month?: number[]): Schedule => ({
  windows: [{ days, start, end, ...(weeks_of_month ? { weeks_of_month } : {}) }],
});

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const MON_SAT = [...WEEKDAYS, 'sat'];
const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri'];
const PERMITS = ['DEMO-A', 'DEMO-B', 'DEMO-C', 'DEMO-D'];
const LIMITS = [60, 120, 180, 240];
const COLORS = ['red', 'yellow', 'green', 'white'];
const TYPES = ['no_parking', 'no_parking', 'no_standing', 'no_stopping', 'no_stopping'] as const;

function sweepingSchedule(rng: Rng): Schedule {
  const day = pick(DAY_NAMES, rng);
  const start = pick(['08:00', '09:00', '10:00'], rng);
  const end = String(Number(start.slice(0, 2)) + 2).padStart(2, '0') + ':00';
  if (chance(0.15, rng)) return win([day], start, end, pick([[1, 3], [2, 4]], rng)); // a few every-other-week routes
  return win([day], start, end);
}

function timedSchedule(rng: Rng): Schedule {
  const r = rng();
  if (r < 0.1) return null;
  if (r < 0.55) return win(WEEKDAYS, '08:00', '18:00');
  if (r < 0.85) return win(MON_SAT, '09:00', '18:00');
  return win(WEEKDAYS, '07:00', '19:00');
}

function restrictionSchedule(type: string, rng: Rng): Schedule {
  if (type === 'no_stopping') return chance(0.7, rng) ? null : win(WEEKDAYS, '07:00', '09:00');
  if (type === 'no_standing') return chance(0.5, rng) ? win(WEEKDAYS, '07:00', '09:00') : win(WEEKDAYS, '16:00', '19:00');
  return chance(0.4, rng) ? win(WEEKDAYS, '18:00', '06:00') : win(MON_SAT, '08:00', '18:00'); // 18:00 to 06:00 crosses midnight
}

function colorSchedule(color: string, rng: Rng): Schedule {
  if (color === 'green') return win(WEEKDAYS, '08:00', '18:00');
  if (color === 'yellow' && chance(0.3, rng)) return win(WEEKDAYS, '07:00', '18:00');
  return null;
}

function rowFor(layer: Layer, segment_id: string, side: Side, rng: Rng): RuleRow {
  const row: RuleRow = { segment_id, side, layer, type: null, limit_minutes: null, permit_code: null, color_key: null, schedule: null };
  switch (layer) {
    case 'sweeping':
      row.schedule = sweepingSchedule(rng);
      break;
    case 'timed_parking':
      row.limit_minutes = pick(LIMITS, rng);
      row.permit_code = chance(0.2, rng) ? pick(PERMITS, rng) : null;
      row.schedule = timedSchedule(rng);
      break;
    case 'restrictions':
      row.type = pick(TYPES, rng);
      row.permit_code = row.type === 'no_parking' && chance(0.5, rng) ? pick(PERMITS, rng) : null;
      row.schedule = restrictionSchedule(row.type, rng);
      break;
    case 'curb_color':
      row.color_key = pick(COLORS, rng);
      row.schedule = colorSchedule(row.color_key, rng);
      break;
  }
  return row;
}

const LAYER_ODDS: [Layer, number][] = [
  ['sweeping', 0.45],
  ['timed_parking', 0.45],
  ['restrictions', 0.4],
  ['curb_color', 0.35],
];

export function generateSampleRows(segments: SegmentCollection, seed: number): RuleRow[] {
  const rng = mulberry32(seed);
  const picked = pickSegments(segments, rng);
  const rows: RuleRow[] = [];
  for (const segment of segments.features) {
    const id = segment.properties.segment_id;
    if (!picked.has(id)) continue;
    const sides = sidesOf(segment);
    let layers = LAYER_ODDS.filter(([, p]) => chance(p, rng)).map(([layer]) => layer);
    if (layers.length === 0) layers = [pick(LAYER_ODDS, rng)[0]];
    for (const layer of layers) rows.push(rowFor(layer, id, pick(sides, rng), rng));
  }
  return rows;
}

const HEADER = 'segment_id,side,layer,type,limit_minutes,permit_code,color_key,schedule';

const cell = (v: string | number | null): string => {
  if (v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function rowsToCsv(rows: RuleRow[]): string {
  const lines = rows.map((r) =>
    [r.segment_id, r.side, r.layer, r.type, r.limit_minutes, r.permit_code, r.color_key, r.schedule === null ? null : JSON.stringify(r.schedule)]
      .map(cell)
      .join(','),
  );
  return [HEADER, ...lines].join('\n') + '\n';
}
