// Pure logic for the sample-data generator (task TD-2). No file I/O here: the CLI reads and writes the files.
//
// Picks about 1 in 15 segments, spread over the whole city, and gives each some made-up rules.
// Everything random comes from a seeded generator, so the same segments and seed give the same rows.
import type { RuleRow, SegmentCollection, Side } from './build.ts';
import type { ZoningCollection } from './sample-zoning.ts';

export const SAMPLE_SEED = 20261023;
const ONE_IN = 15;
const PICK_GRID = 8; // the city is cut into 8 x 8 cells and each cell contributes its share, so picks cannot clump

type Rng = () => number;
type Segment = SegmentCollection['features'][number];
type Layer = RuleRow['layer'];
type Window = { days: string[]; start: string; end: string; weeks_of_month?: number[] };
type Schedule = { windows: Window[] } | null;

/** mulberry32: small, fast and identical on every machine. */
export function mulberry32(seed: number): Rng {
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

export function bboxOf(segments: SegmentCollection): [number, number, number, number] {
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

const SIDES: [Side, Side] = ['L', 'R'];

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

const AREA_GRID = 4; // sweeping areas: a 4 x 4 grid over the city, checkerboard cells (half the city) get day-by-day sweeping

/**
 * Day-by-day sweeping for the checkerboard half of the city (task TD-4). Each area gets its own pair of
 * consecutive weekdays, so the two sides of a block sweep on different days and neighbouring areas differ.
 * Returns null outside those areas.
 */
function areaSweepDays(segment: Segment, segments: SegmentCollection): [string, string] | null {
  const [col, row] = cellOf(segment, segments, AREA_GRID).split(',').map(Number);
  if ((col + row) % 2 !== 0) return null;
  const area = Math.floor((row * AREA_GRID + col) / 2); // 0 to 7 over the eight checkerboard cells
  return [DAY_NAMES[area % 5], DAY_NAMES[(area + 1) % 5]];
}

/** One sweeping row per side, each with a single-day window; a few blocks start at 08:30 to test the hourly rule. */
function dayByDaySweepingRows(segment_id: string, sides: [Side, Side], days: [string, string], rng: Rng): RuleRow[] {
  const half = chance(0.15, rng);
  const start = half ? '08:30' : pick(['08:00', '09:00', '10:00'], rng);
  const end = half ? '10:30' : String(Number(start.slice(0, 2)) + 2).padStart(2, '0') + ':00';
  return sides.map((side, i) => ({
    segment_id, side, layer: 'sweeping' as const, type: null, limit_minutes: null, permit_code: null, color_key: null,
    schedule: win([days[i]], start, end),
  }));
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

export type PermitZoneCollection = {
  features: { properties: { permit_code: string }; geometry: { coordinates: number[][][] } }[];
};
/** The polygon files the timed parking spread reads (task TD-5). Without them the rows are exactly as TD-2 wrote them. */
export type SampleContext = { zoning: ZoningCollection; permitZones: PermitZoneCollection };

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const middleOf = (segment: Segment): [number, number] => {
  const line = segment.geometry.coordinates;
  return line[Math.floor(line.length / 2)] as [number, number];
};

/** The zoning polygon holding a segment's middle point, if any. */
export function zoneAt(segment: Segment, zoning: ZoningCollection): ZoningCollection['features'][number] | undefined {
  const [x, y] = middleOf(segment);
  return zoning.features.find((z) => inRing(x, y, z.geometry.coordinates[0]));
}

/** The permit code of the permit zone holding a segment's middle point, if any. */
export function permitCodeAt(segment: Segment, permitZones: PermitZoneCollection): string | null {
  const [x, y] = middleOf(segment);
  return permitZones.features.find((z) => inRing(x, y, z.geometry.coordinates[0]))?.properties.permit_code ?? null;
}

// Timed parking spread (task TD-5). Limits cycle through this list, so every one lands in several parts of the city;
// 30 is the odd value that tests the fallback style.
const SPREAD_LIMITS = [60, 120, 180, 240, 60, 120, 180, 240, 30];
const ADD_MAPPED_COMMERCIAL = 0.6; // chance a segment already mapped in a commercial or mixed-use zone gets a timed row
const ADD_MAPPED_ELSEWHERE = 0.06;
const ADD_NEW_COMMERCIAL = 0.04; // chance an unmapped one is mapped, with timed parking only
const ADD_NEW_ELSEWHERE = 0.003;
const ADD_IN_PERMIT_ZONE = 0.5; // for mapped segments inside a permit zone
const PERMIT_ON_ROW = 0.55;
const ON_SWEPT_SIDE = 0.5;

function spreadSchedule(rng: Rng): Schedule {
  const r = rng();
  if (r < 0.12) return null; // always in force
  if (r < 0.52) return win(MON_SAT, '08:00', '18:00');
  if (r < 0.82) return win(WEEKDAYS, '08:00', '18:00');
  return win(MON_SAT, '09:00', '18:00');
}

/**
 * Adds timed parking, mostly where the zoning is commercial or mixed use: on segments already mapped and on a few
 * more (timed parking only; unmapped blocks still far outnumber mapped ones). It also puts the matching DEMO- permit
 * code on a few rows inside a permit zone.
 * Uses its own generator, so the other layers' rows do not move.
 */
function spreadTimedParking(rows: RuleRow[], segments: SegmentCollection, ctx: SampleContext, seed: number): RuleRow[] {
  const rng = mulberry32((seed ^ 0x54494d45) >>> 0);
  const byId = new Map(segments.features.map((f) => [f.properties.segment_id, f]));
  const timedSides = new Map<string, Set<Side>>();
  const sweptSides = new Map<string, Side[]>();
  for (const r of rows) {
    if (r.layer === 'timed_parking') timedSides.set(r.segment_id, new Set([...(timedSides.get(r.segment_id) ?? []), r.side]));
    if (r.layer === 'sweeping') sweptSides.set(r.segment_id, [...(sweptSides.get(r.segment_id) ?? []), r.side]);
  }
  const permitOf = (id: string) => permitCodeAt(byId.get(id)!, ctx.permitZones);

  let n = 0;
  const out: RuleRow[] = [];
  const rowsOf = new Map<string, RuleRow[]>();
  for (const r of rows) rowsOf.set(r.segment_id, [...(rowsOf.get(r.segment_id) ?? []), r]);
  for (const segment of segments.features) {
    const id = segment.properties.segment_id;
    const own = (rowsOf.get(id) ?? []).map((r) => {
      // Existing timed rows inside a permit zone also get the zone's code now and then.
      const permit = r.layer === 'timed_parking' && r.permit_code === null ? permitOf(id) : null;
      return permit && chance(PERMIT_ON_ROW, rng) ? { ...r, permit_code: permit } : r;
    });
    out.push(...own);
    if (timedSides.has(id)) continue;
    const category = zoneAt(segment, ctx.zoning)?.properties.category;
    const commercial = category === 'commercial' || category === 'mixed_use';
    const permit = permitOf(id);
    const mapped = own.length > 0;
    const p = commercial ? (mapped ? ADD_MAPPED_COMMERCIAL : ADD_NEW_COMMERCIAL) : mapped ? ADD_MAPPED_ELSEWHERE : ADD_NEW_ELSEWHERE;
    if (!chance(permit && mapped ? Math.max(p, ADD_IN_PERMIT_ZONE) : p, rng)) continue;
    const swept = sweptSides.get(id);
    const side = swept && chance(ON_SWEPT_SIDE, rng) ? pick(swept, rng) : pick(SIDES, rng);
    out.push({
      segment_id: id, side, layer: 'timed_parking', type: null, color_key: null,
      limit_minutes: SPREAD_LIMITS[n++ % SPREAD_LIMITS.length],
      permit_code: permit && chance(PERMIT_ON_ROW, rng) ? permit : null,
      schedule: spreadSchedule(rng),
    });
  }
  return out;
}

// Restrictions spread (task TD-6). The earlier steps already make no parking (timed or with a permit code), no standing
// and no stopping rows; this adds what was missing: no parking at any time, permit-only rows that use the code of the
// DEMO- zone they sit in, no stopping on corner blocks, and restrictions on sides that already have timed parking.
const CORNER_MAX_M = 90; // a "corner" block is short and ends at a different street
const ADD_PERMIT_ONLY = [0.25, 0.03]; // [mapped, unmapped] chance for segments inside a permit zone
const ADD_NO_STOPPING = [0.15, 0.012]; // corner blocks
const ADD_ANY_TIME = [0.05, 0.006];
const ADD_NO_STANDING = [0.04, 0.004];
const ADD_ON_TIMED_SIDE = 0.2;

const metres = (a: number[], b: number[]) => Math.hypot((b[0] - a[0]) * 92000, (b[1] - a[1]) * 111000); // Burbank's latitude

const streetsAtCache = new WeakMap<SegmentCollection, Map<string, Set<string>>>();

/** A short block with a different street meeting at one of its ends. */
export function isCorner(segment: Segment, segments: SegmentCollection): boolean {
  let streetsAt = streetsAtCache.get(segments);
  if (!streetsAt) {
    streetsAt = new Map();
    for (const f of segments.features) {
      const c = f.geometry.coordinates;
      for (const p of [c[0], c[c.length - 1]]) {
        const key = p.join();
        streetsAt.set(key, (streetsAt.get(key) ?? new Set()).add(f.properties.street));
      }
    }
    streetsAtCache.set(segments, streetsAt);
  }
  const c = segment.geometry.coordinates;
  let length = 0;
  for (let i = 1; i < c.length; i++) length += metres(c[i - 1], c[i]);
  if (length >= CORNER_MAX_M) return false;
  return [c[0], c[c.length - 1]].some((p) => [...streetsAt.get(p.join())!].some((s) => s !== segment.properties.street));
}

/**
 * Adds restrictions on top of the existing rows (they all stay, in place); new rows go on the end.
 * Uses its own generator, so no other row moves.
 */
function spreadRestrictions(rows: RuleRow[], segments: SegmentCollection, ctx: SampleContext, seed: number): RuleRow[] {
  const rng = mulberry32((seed ^ 0x52455354) >>> 0);
  const taken = new Set<string>(); // sides that already have a restriction
  const mapped = new Set<string>();
  const timed = new Set<string>();
  for (const r of rows) {
    mapped.add(r.segment_id);
    if (r.layer === 'restrictions') taken.add(`${r.segment_id}|${r.side}`);
    if (r.layer === 'timed_parking') timed.add(`${r.segment_id}|${r.side}`);
  }
  const added: RuleRow[] = [];
  const add = (segment_id: string, side: Side, type: string, permit_code: string | null, schedule: Schedule) => {
    taken.add(`${segment_id}|${side}`);
    added.push({ segment_id, side, layer: 'restrictions', type: type as RuleRow['type'], limit_minutes: null, permit_code, color_key: null, schedule });
  };
  const freeSide = (id: string, preferred?: Side): Side | null => {
    const free = SIDES.filter((s) => !taken.has(`${id}|${s}`));
    if (free.length === 0) return null;
    return preferred && free.includes(preferred) ? preferred : pick(free, rng);
  };
  for (const segment of segments.features) {
    const id = segment.properties.segment_id;
    const k = mapped.has(id) ? 0 : 1;
    const permit = permitCodeAt(segment, ctx.permitZones);
    const corner = isCorner(segment, segments);
    let side: Side | null;
    if (permit && chance(ADD_PERMIT_ONLY[k], rng) && (side = freeSide(id))) add(id, side, 'no_parking', permit, restrictionSchedule('no_parking', rng));
    if (corner && chance(ADD_NO_STOPPING[k], rng) && (side = freeSide(id))) add(id, side, 'no_stopping', null, restrictionSchedule('no_stopping', rng));
    if (chance(ADD_ANY_TIME[k], rng) && (side = freeSide(id))) add(id, side, 'no_parking', null, null);
    if (chance(ADD_NO_STANDING[k], rng) && (side = freeSide(id))) add(id, side, 'no_standing', null, restrictionSchedule('no_standing', rng));
    // A restriction on a side that already has timed parking, such as a rush-hour ban on a time-limited curb.
    const timedSide = SIDES.find((s) => timed.has(`${id}|${s}`) && !taken.has(`${id}|${s}`));
    if (timedSide && chance(ADD_ON_TIMED_SIDE, rng)) {
      const type = pick(['no_parking', 'no_standing'], rng);
      add(id, timedSide, type, null, type === 'no_parking' ? win(WEEKDAYS, '07:00', '09:00') : restrictionSchedule(type, rng));
    }
  }
  return [...rows, ...added];
}

export function generateSampleRows(segments: SegmentCollection, seed: number, context?: SampleContext): RuleRow[] {
  const rng = mulberry32(seed);
  const picked = pickSegments(segments, rng);
  const rows: RuleRow[] = [];
  for (const segment of segments.features) {
    const id = segment.properties.segment_id;
    if (!picked.has(id)) continue;
    let layers = LAYER_ODDS.filter(([, p]) => chance(p, rng)).map(([layer]) => layer);
    if (layers.length === 0) layers = [pick(LAYER_ODDS, rng)[0]];
    const sweepDays = areaSweepDays(segment, segments);
    if (sweepDays && !layers.includes('sweeping')) layers = ['sweeping', ...layers];
    for (const layer of layers) {
      if (layer === 'sweeping' && sweepDays) rows.push(...dayByDaySweepingRows(id, SIDES, sweepDays, rng));
      else rows.push(rowFor(layer, id, pick(SIDES, rng), rng));
    }
  }
  if (!context) return rows;
  return spreadRestrictions(spreadTimedParking(rows, segments, context, seed), segments, context, seed);
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
