import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SegmentCollection } from './build.ts';
import { cellOf, sidePoint } from './sample-data.ts';
import { generatePermitZones, permitZonesToJson } from './sample-permit-zones.ts';
import { generateZoning } from './sample-zoning.ts';

const data = resolve(import.meta.dirname, '..', '..', 'data');
const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
const zoning = generateZoning(real, 'burbank-sample');
const zones = generatePermitZones(real, zoning, 'burbank-sample');

type Ring = number[][];
const ringOf = (i: number): Ring => zones.features[i].geometry.coordinates[0];

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when two segments cross at a point inside both (touching at an end or running along each other does not count). */
function crosses(a: number[], b: number[], c: number[], d: number[]): boolean {
  const o = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

describe('generatePermitZones (TD-8)', () => {
  it('makes 8 zones coded DEMO-A to DEMO-H, with the sample city id', () => {
    expect(zones.features.map((f) => f.properties.permit_code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l) => `DEMO-${l}`));
    for (const f of zones.features) {
      expect(f.properties.city_id).toBe('burbank-sample');
      expect(f.properties.name).toBeTruthy();
      expect(f.geometry.type).toBe('Polygon');
    }
  });

  it('is repeatable', () => {
    expect(generatePermitZones(real, zoning, 'burbank-sample')).toEqual(zones);
  });

  it('gives closed, single-ring polygons that follow street lines (every vertex is a street vertex)', () => {
    const streetPoints = new Set(real.features.flatMap((f) => f.geometry.coordinates.map((c) => c.join())));
    for (const f of zones.features) {
      expect(f.geometry.coordinates).toHaveLength(1);
      const ring = f.geometry.coordinates[0];
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      for (const p of ring) expect(streetPoints.has(p.join()), `${f.properties.permit_code} ${p}`).toBe(true);
    }
  });

  it('never overlaps: no edges cross, and no street side lies in two zones', () => {
    for (let a = 0; a < zones.features.length; a++) {
      for (let b = a + 1; b < zones.features.length; b++) {
        const ra = ringOf(a);
        const rb = ringOf(b);
        for (let i = 1; i < ra.length; i++) {
          for (let j = 1; j < rb.length; j++) {
            expect(crosses(ra[i - 1], ra[i], rb[j - 1], rb[j]), `${a} x ${b}`).toBe(false);
          }
        }
      }
    }
    for (const s of real.features) {
      for (const side of ['L', 'R'] as const) {
        const [x, y] = sidePoint(s, side);
        const hits = zones.features.filter((f) => inRing(x, y, f.geometry.coordinates[0]));
        expect(hits.length, `${s.properties.segment_id} ${side}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('makes at least two zones share an edge', () => {
    const edges = (ring: Ring) => new Set(ring.slice(1).map((p, i) => [ring[i].join(), p.join()].sort().join('>')));
    const shared = (a: number, b: number) => [...edges(ringOf(a))].filter((e) => edges(ringOf(b)).has(e)).length;
    let pairs = 0;
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) if (shared(a, b) > 0) pairs++;
    expect(pairs).toBeGreaterThanOrEqual(1);
  });

  it('leaves most of the city outside any zone', () => {
    let inside = 0;
    let total = 0;
    for (const s of real.features) {
      for (const side of ['L', 'R'] as const) {
        const [x, y] = sidePoint(s, side);
        total++;
        if (zones.features.some((f) => inRing(x, y, f.geometry.coordinates[0]))) inside++;
      }
    }
    expect(inside / total).toBeGreaterThan(0.05);
    expect(inside / total).toBeLessThan(0.3);
  });

  it('spreads zones over at least 4 separate parts of the city', () => {
    const cells = new Set<string>();
    for (const f of zones.features) {
      const ring = f.geometry.coordinates[0];
      const [x, y] = ring.reduce((m, p) => [m[0] + p[0] / ring.length, m[1] + p[1] / ring.length], [0, 0]);
      const fake = { geometry: { coordinates: [[x, y]] } } as unknown as SegmentCollection['features'][number];
      cells.add(cellOf(fake, real, 4));
    }
    expect(cells.size).toBeGreaterThanOrEqual(4);
  });

  it('puts most of each zone inside SAMPLE- residential zoning', () => {
    const residential = zoning.features.filter((z) => z.properties.category === 'residential');
    let inZones = 0;
    let resi = 0;
    for (const s of real.features) {
      for (const side of ['L', 'R'] as const) {
        const [x, y] = sidePoint(s, side);
        if (!zones.features.some((f) => inRing(x, y, f.geometry.coordinates[0]))) continue;
        inZones++;
        if (residential.some((z) => inRing(x, y, z.geometry.coordinates[0]))) resi++;
      }
    }
    expect(resi / inZones).toBeGreaterThan(0.7);
  });

  it('gives every zone some street sides', () => {
    for (const f of zones.features) {
      const n = real.features.flatMap((s) => (['L', 'R'] as const).map((side) => sidePoint(s, side))).filter(([x, y]) => inRing(x, y, f.geometry.coordinates[0])).length;
      expect(n, f.properties.permit_code).toBeGreaterThanOrEqual(10);
    }
  });

  it('writes one feature per line', () => {
    expect(permitZonesToJson(zones).split('\n')).toHaveLength(8 + 3);
  });
});
