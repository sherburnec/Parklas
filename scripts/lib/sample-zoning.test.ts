import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SegmentCollection } from './build.ts';
import { generateZoning, ZONING_CATEGORIES, ZONING_CODES, zoningConfig, zoningToJson, type ZoningCollection } from './sample-zoning.ts';

type Zone = ZoningCollection['features'][number];
type Rect = { w: number; e: number; s: number; n: number };

const rect = (f: Zone): Rect => {
  const ring = f.geometry.coordinates[0];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return { w: Math.min(...xs), e: Math.max(...xs), s: Math.min(...ys), n: Math.max(...ys) };
};

// Half-open on the east and north edges, so a point on a shared edge belongs to one zone only.
const zonesAt = (zoning: ZoningCollection, x: number, y: number) =>
  zoning.features.filter((f) => {
    const r = rect(f);
    return x >= r.w && x < r.e && y >= r.s && y < r.n;
  });

const touches = (a: Rect, b: Rect) =>
  a.e === b.w || b.e === a.w
    ? Math.min(a.n, b.n) > Math.max(a.s, b.s)
    : a.n === b.s || b.n === a.s
      ? Math.min(a.e, b.e) > Math.max(a.w, b.w)
      : false;

/** How many separate regions (cells that share an edge count as one) a category forms. */
function parts(zoning: ZoningCollection, category: string): number {
  const mine = zoning.features.filter((f) => f.properties.category === category).map(rect);
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
        if (!seen.has(j) && touches(mine[k], m)) stack.push(j);
      });
    }
  });
  return count;
}

function checkZoning(zoning: ZoningCollection, segments: SegmentCollection) {
  it('puts every segment point in exactly one zone', () => {
    for (const seg of segments.features) for (const [x, y] of seg.geometry.coordinates) expect(zonesAt(zoning, x, y)).toHaveLength(1);
  });

  it('has no gaps or overlaps: zone areas add up to the outer box and no two overlap', () => {
    const rs = zoning.features.map(rect);
    const area = rs.reduce((a, r) => a + (r.e - r.w) * (r.n - r.s), 0);
    const box = (Math.max(...rs.map((r) => r.e)) - Math.min(...rs.map((r) => r.w))) * (Math.max(...rs.map((r) => r.n)) - Math.min(...rs.map((r) => r.s)));
    expect(area).toBeCloseTo(box, 12);
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const ox = Math.min(rs[i].e, rs[j].e) - Math.max(rs[i].w, rs[j].w);
        const oy = Math.min(rs[i].n, rs[j].n) - Math.max(rs[i].s, rs[j].s);
        expect(ox > 1e-12 && oy > 1e-12).toBe(false);
      }
    }
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
