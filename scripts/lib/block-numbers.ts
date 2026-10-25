// Pure logic for the one-off block number extraction (task M5-5). No I/O here.
// A block number is never guessed: fewer than 2 matching addresses, or addresses in different hundreds, leave it empty.
import type { BlockRow } from './blocks.ts';
import type { SegmentCollection } from './segments.ts';

export interface Address {
  housenumber: number;
  street: string;
  lat: number;
  lon: number;
}

/** What Overpass returns for `out center tags`: nodes carry lat/lon, ways and relations a center. */
export interface OverpassAddressElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** An address belongs to a segment only within this distance of its line. */
export const MAX_DISTANCE_M = 40;

/**
 * Street names match when they are equal ignoring case, repeated spaces and trailing periods.
 * The segment extractor keeps the OSM `name` as it is and has no normalisation of its own, so this is deliberately
 * conservative: abbreviations ("Ave", "W") are not expanded. A missed match only sends a block to the hand-entry report.
 */
export function normaliseStreet(name: string): string {
  return name.trim().replace(/\.+$/, '').replace(/\s+/g, ' ').toLowerCase();
}

/** A plain number, optionally with one unit letter ("1204A"). Ranges, lists, fractions, zero and text are refused. */
export function parseHouseNumber(raw: string): number | null {
  const m = /^\s*(\d+)\s?[A-Za-z]?\s*$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export const hundredOf = (n: number): number => Math.floor(n / 100) * 100;

/** The block number for the house numbers found on one segment, or null when it cannot be said for certain. */
export function blockNumberFor(numbers: number[]): number | null {
  if (numbers.length < 2) return null;
  const hundreds = new Set(numbers.map(hundredOf));
  return hundreds.size === 1 ? [...hundreds][0] : null;
}

export function elementsToAddresses(elements: OverpassAddressElement[]): Address[] {
  const out: Address[] = [];
  for (const el of elements) {
    const street = el.tags?.['addr:street'];
    const raw = el.tags?.['addr:housenumber'];
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!street || raw === undefined || lat === undefined || lon === undefined) continue;
    const housenumber = parseHouseNumber(raw);
    if (housenumber !== null) out.push({ housenumber, street, lat, lon });
  }
  return out;
}

const EARTH_M = 6371008.8;

/** Shortest distance in metres from a point to a polyline, on a local flat projection (fine at block scale). */
export function distanceToLineM(point: [number, number], line: number[][]): number {
  const k = Math.cos((point[1] * Math.PI) / 180);
  const toM = (c: number[]): [number, number] => [((c[0] - point[0]) * Math.PI * EARTH_M * k) / 180, ((c[1] - point[1]) * Math.PI * EARTH_M) / 180];
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = toM(line[i]);
    const [bx, by] = toM(line[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Each address goes to the nearest segment of the same street within MAX_DISTANCE_M. Returns segment_id to house numbers. */
export function assignAddresses(addresses: Address[], segments: SegmentCollection['features']): Map<string, number[]> {
  const byStreet = new Map<string, SegmentCollection['features']>();
  for (const s of segments) {
    const key = normaliseStreet(s.properties.street);
    byStreet.set(key, [...(byStreet.get(key) ?? []), s]);
  }
  const found = new Map<string, number[]>();
  for (const a of addresses) {
    let bestId: string | null = null;
    let bestD = MAX_DISTANCE_M;
    for (const s of byStreet.get(normaliseStreet(a.street)) ?? []) {
      const d = distanceToLineM([a.lon, a.lat], s.geometry.coordinates);
      if (d <= bestD) {
        bestD = d;
        bestId = s.properties.segment_id;
      }
    }
    if (bestId !== null) found.set(bestId, [...(found.get(bestId) ?? []), a.housenumber]);
  }
  return found;
}

/** One row per segment, in the order given. */
export function summariseSegments(segmentIds: string[], found: Map<string, number[]>): BlockRow[] {
  return segmentIds.map((segment_id) => {
    const nums = found.get(segment_id) ?? [];
    return {
      segment_id,
      block_number: blockNumberFor(nums),
      low_address: nums.length ? Math.min(...nums) : null,
      high_address: nums.length ? Math.max(...nums) : null,
      source: 'osm',
    };
  });
}

/** Manual rows win and are kept as they are (even for a segment the new run no longer has); everything else is the new result. */
export function mergeBlockRows(existing: BlockRow[], fresh: BlockRow[]): BlockRow[] {
  const manual = new Map(existing.filter((r) => r.source === 'manual').map((r) => [r.segment_id, r]));
  const merged = new Map<string, BlockRow>(fresh.map((r) => [r.segment_id, r]));
  for (const [id, row] of manual) merged.set(id, row);
  return [...merged.values()].sort((a, b) => (a.segment_id < b.segment_id ? -1 : 1));
}

function reasonFor(r: BlockRow): string {
  if (r.low_address === null) return 'no address found';
  if (r.low_address === r.high_address && r.block_number === null) return 'only 1 address found';
  if (hundredOf(r.low_address) !== hundredOf(r.high_address!)) return `addresses ${r.low_address} to ${r.high_address} are in different hundreds`;
  return 'only 1 address found';
}

/** The hand-entry to-do list. A block needs entry when it has no number; manual rows with a number are done. */
export function renderReport(cityId: string, rows: BlockRow[], streetOf: Map<string, string>): string {
  const todo = rows.filter((r) => r.block_number === null);
  const numbered = rows.length - todo.length;
  const lines = [
    `# Block numbers needing hand entry: ${cityId}`,
    '',
    'Written by `scripts/extract-block-numbers.ts`. Do not edit; fill the gaps in `blocks.csv` instead.',
    '',
    `- Blocks numbered: ${numbered} of ${rows.length}`,
    `- Blocks needing hand entry: ${todo.length}`,
    '',
    'To fill one, set `block_number` (a multiple of 100) and `source` to `manual` on its row in `blocks.csv`. Manual rows are kept when the script is re-run.',
    '',
    '| segment_id | street | reason |',
    '| --- | --- | --- |',
    ...todo.map((r) => `| ${r.segment_id} | ${streetOf.get(r.segment_id) ?? ''} | ${reasonFor(r)} |`),
    '',
  ];
  return lines.join('\n');
}
