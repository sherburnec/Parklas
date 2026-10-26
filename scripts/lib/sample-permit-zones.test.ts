import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SegmentCollection } from './build.ts';
import { bboxOf, cellOf, sidePoint } from './sample-data.ts';
import { generatePermitZones, permitZonesToJson } from './sample-permit-zones.ts';

const data = resolve(import.meta.dirname, '..', '..', 'data');
const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
const zones = generatePermitZones(real, 'burbank-sample');

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

const allSides = () => real.features.flatMap((s) => (['L', 'R'] as const).map((side) => ({ id: `${s.properties.segment_id} ${side}`, at: sidePoint(s, side) })));
const zonesHolding = (x: number, y: number) => zones.features.filter((f) => inRing(x, y, f.geometry.coordinates[0]));

describe('generatePermitZones (TD-8, TD-8.2)', () => {
  it('makes 8 zones coded DEMO-A to DEMO-H, with the sample city id', () => {
    expect(zones.features.map((f) => f.properties.permit_code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l) => `DEMO-${l}`));
    for (const f of zones.features) {
      expect(f.properties.city_id).toBe('burbank-sample');
      expect(f.properties.name).toBeTruthy();
      expect(f.geometry.type).toBe('Polygon');
    }
  });

  it('is repeatable', () => {
    expect(generatePermitZones(real, 'burbank-sample')).toEqual(zones);
  });

  it('gives closed, single-ring polygons', () => {
    for (const f of zones.features) {
      expect(f.geometry.coordinates).toHaveLength(1);
      const ring = f.geometry.coordinates[0];
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
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
    for (const { id, at } of allSides()) expect(zonesHolding(...at).length, id).toBeLessThanOrEqual(1);
  });

  it('puts every side of every block in a zone, so no permit_zone is null', () => {
    for (const { id, at } of allSides()) expect(zonesHolding(...at).length, id).toBe(1);
  });

  it('covers the whole city: every point on a grid over it is in exactly one zone', () => {
    const [minX, minY, maxX, maxY] = bboxOf(real);
    const n = 80;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const x = minX + ((maxX - minX) * i) / n;
        const y = minY + ((maxY - minY) * j) / n;
        expect(zonesHolding(x, y).length, `${x},${y}`).toBe(1);
      }
    }
  });

  it('makes every zone share an edge with another zone', () => {
    const edges = (ring: Ring) => new Set(ring.slice(1).map((p, i) => [ring[i].join(), p.join()].sort().join('>')));
    for (let a = 0; a < 8; a++) {
      const mine = edges(ringOf(a));
      const touches = [0, 1, 2, 3, 4, 5, 6, 7].some((b) => b !== a && [...edges(ringOf(b))].some((e) => mine.has(e)));
      expect(touches, zones.features[a].properties.permit_code).toBe(true);
    }
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

  it('gives every zone a real share of the street sides', () => {
    const sides = allSides();
    for (const f of zones.features) {
      const n = sides.filter(({ at }) => inRing(at[0], at[1], f.geometry.coordinates[0])).length;
      expect(n / sides.length, f.properties.permit_code).toBeGreaterThan(0.02);
    }
  });

  it('writes one feature per line', () => {
    expect(permitZonesToJson(zones).split('\n')).toHaveLength(8 + 3);
  });
});
