import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SegmentCollection } from './build.ts';
import { generateZoning, ZONING_CATEGORIES, ZONING_CODES, zoningConfig, zoningToJson, type ZoningCollection } from './sample-zoning.ts';

type Zone = ZoningCollection['features'][number];
type Pt = number[];

const ring = (f: Zone) => f.geometry.coordinates[0];
const key = (p: Pt) => `${p[0]},${p[1]}`;
const edgeKey = (a: Pt, b: Pt) => [key(a), key(b)].sort().join('|');
const edgesOf = (r: Pt[]) => r.slice(1).map((p, i) => edgeKey(r[i], p));

function areaOf(r: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < r.length - 1; i++) sum += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(sum) / 2;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

const onSegment = (p: Pt, a: Pt, b: Pt) =>
  Math.abs(cross(a, b, p)) < 1e-12 &&
  p[0] >= Math.min(a[0], b[0]) - 1e-12 &&
  p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
  p[1] >= Math.min(a[1], b[1]) - 1e-12 &&
  p[1] <= Math.max(a[1], b[1]) + 1e-12;

/** 'on' means on the border; 'in' and 'out' are strict. */
function locate(p: Pt, r: Pt[]): 'in' | 'on' | 'out' {
  let inside = false;
  for (let i = 0; i < r.length - 1; i++) {
    const [a, b] = [r[i], r[i + 1]];
    if (onSegment(p, a, b)) return 'on';
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 'in' : 'out';
}

/** True if two edges cross at a point that is not a shared end point. */
const properlyCross = (a: Pt, b: Pt, c: Pt, d: Pt) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

function isSimple(r: Pt[]): boolean {
  const n = r.length - 1;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) if (properlyCross(r[i], r[i + 1], r[j], r[j + 1])) return false;
  return new Set(r.slice(0, n).map(key)).size === n;
}

/** How many separate regions (cells that share a border edge count as one) a category forms. */
function parts(zoning: ZoningCollection, category: string): number {
  const mine = zoning.features.filter((f) => f.properties.category === category).map((f) => new Set(edgesOf(ring(f))));
  const seen = new Set<number>();
  let count = 0;
  mine.forEach((_, i) => {
    if (seen.has(i)) return;
    count++;
    const stack = [i];
    while (stack.length) {
      const k = stack.pop()!;
      if (seen.has(k)) continue;
      seen.add(k);
      mine.forEach((m, j) => {
        if (!seen.has(j) && [...m].some((e) => mine[k].has(e))) stack.push(j);
      });
    }
  });
  return count;
}

function checkZoning(zoning: ZoningCollection, segments: SegmentCollection) {
  it('makes every zone a closed polygon that does not cross itself, and most are not 4-sided', () => {
    for (const f of zoning.features) {
      const r = ring(f);
      expect(key(r[0])).toBe(key(r[r.length - 1]));
      expect(isSimple(r), f.properties.name).toBe(true);
    }
    expect(zoning.features.filter((f) => ring(f).length - 1 > 4).length).toBeGreaterThan(zoning.features.length / 2);
  });

  it('puts every segment point in a zone and never strictly inside two', () => {
    for (const seg of segments.features) {
      for (const p of seg.geometry.coordinates) {
        const where = zoning.features.map((f) => locate(p, ring(f)));
        expect(where.filter((w) => w === 'in').length).toBeLessThanOrEqual(1);
        expect(where.filter((w) => w !== 'out').length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('has no gaps or overlaps: every border edge is shared by two zones or lies on the straight outer edge, and areas add up to the outer box', () => {
    const uses = new Map<string, number>();
    for (const f of zoning.features) for (const e of edgesOf(ring(f))) uses.set(e, (uses.get(e) ?? 0) + 1);
    for (const n of uses.values()) expect(n).toBeLessThanOrEqual(2);
    const outer = [...uses.entries()].filter(([, n]) => n === 1).map(([k]) => k.split('|').map((s) => s.split(',').map(Number)));
    const xs = outer.flat().map((p) => p[0]);
    const ys = outer.flat().map((p) => p[1]);
    const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (const [a, b] of outer) expect((a[0] === b[0] && (a[0] === w || a[0] === e)) || (a[1] === b[1] && (a[1] === s || a[1] === n))).toBe(true);
    const total = zoning.features.reduce((sum, f) => sum + areaOf(ring(f)), 0);
    expect(total).toBeCloseTo((e - w) * (n - s), 10);
  });

  it('uses every category in at least 2 separate places', () => {
    for (const cat of Object.keys(ZONING_CATEGORIES)) expect(parts(zoning, cat), cat).toBeGreaterThanOrEqual(2);
  });

  it('uses every code, and two codes share a category', () => {
    expect(new Set(zoning.features.map((f) => f.properties.zone_code))).toEqual(new Set(Object.keys(ZONING_CODES)));
    const counts = new Map<string, number>();
    for (const cat of Object.values(ZONING_CODES)) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    expect([...counts.values()].some((n) => n >= 2)).toBe(true);
    for (const f of zoning.features) expect(ZONING_CODES[f.properties.zone_code]).toBe(f.properties.category);
  });

  it('is repeatable', () => {
    expect(zoningToJson(generateZoning(segments, 'x'))).toBe(zoningToJson(generateZoning(segments, 'x')));
  });
}

// A 60 x 60 street grid over Burbank's extent: alternating east-west and north-south blocks.
function gridSegments(): SegmentCollection {
  const features: SegmentCollection['features'] = [];
  const dx = 0.0016;
  const dy = 0.00125;
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 60; j++) {
      const x = -118.368 + i * dx;
      const y = 34.145 + j * dy;
      features.push({
        type: 'Feature',
        properties: { segment_id: `t-${i}-${j}`, street: 'Test St', from_street: null, to_street: null, city_id: 't' },
        geometry: { type: 'LineString', coordinates: (i + j) % 2 === 0 ? [[x, y], [x + dx * 0.8, y]] : [[x, y], [x, y + dy * 0.8]] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

describe('generateZoning on a test grid', () => {
  const segments = gridSegments();
  checkZoning(generateZoning(segments, 't'), segments);
});

describe('data/burbank-sample zoning', () => {
  const root = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(root, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const read = (f: string) => readFileSync(resolve(root, 'burbank-sample', f), 'utf8').replace(/\r\n/g, '\n');

  it('is exactly what the generator writes', () => {
    expect(read('zoning.geojson')).toBe(zoningToJson(generateZoning(real, 'burbank-sample')));
    expect(JSON.parse(read('zoning-categories.json'))).toEqual(zoningConfig('burbank-sample'));
  });

  checkZoning(JSON.parse(read('zoning.geojson')) as ZoningCollection, real);
});
