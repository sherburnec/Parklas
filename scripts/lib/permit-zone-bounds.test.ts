import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { buildPermitZoneBounds, WORLD_RECT } from './permit-zone-bounds.ts';

const zone = (permit_code: string, coordinates: number[][][] | number[][][][], type = 'Polygon') => ({
  properties: { permit_code },
  geometry: { type, coordinates },
});
const square = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];

describe('buildPermitZoneBounds', () => {
  it('writes the west, south, east, north bounds of each zone', () => {
    const out = buildPermitZoneBounds('x', { features: [zone('A', square(-118.35, 34.15, -118.3, 34.2))] });
    expect(out.zones.A.bounds).toEqual([-118.35, 34.15, -118.3, 34.2]);
  });

  it('takes bounds over every part of a MultiPolygon zone', () => {
    const multi = [square(0, 0, 1, 1), square(5, 5, 6, 7)];
    const out = buildPermitZoneBounds('x', { features: [zone('B', multi, 'MultiPolygon')] });
    expect(out.zones.B.bounds).toEqual([0, 0, 6, 7]);
  });

  it('cuts the zone out of the world rectangle: the first ring is the rectangle, the second is the zone', () => {
    const ring = square(-118.35, 34.15, -118.3, 34.2)[0];
    const mask = buildPermitZoneBounds('x', { features: [zone('A', [ring])] }).zones.A.mask;
    expect(mask.type).toBe('Polygon');
    expect(mask.coordinates).toHaveLength(2);
    expect(mask.coordinates[0]).toEqual(WORLD_RECT);
    expect(new Set(mask.coordinates[1].map((p) => p.join()))).toEqual(new Set(ring.map((p) => p.join())));
  });

  it('cuts a hole for each part of a MultiPolygon zone', () => {
    const multi = [square(0, 0, 1, 1), square(5, 5, 6, 6)];
    const mask = buildPermitZoneBounds('x', { features: [zone('B', multi, 'MultiPolygon')] }).zones.B.mask;
    expect(mask.coordinates).toHaveLength(3);
  });

  it("dims a hole inside the zone: the zone's own hole becomes a separate masked island", () => {
    const withHole = [square(0, 0, 10, 10)[0], square(4, 4, 6, 6)[0]];
    const mask = buildPermitZoneBounds('x', { features: [zone('C', withHole)] }).zones.C.mask;
    expect(mask.type).toBe('MultiPolygon');
    const [outside, island] = mask.coordinates as number[][][][];
    expect(outside).toHaveLength(2); // rectangle with the zone's outer ring cut out
    expect(new Set(island[0].map((p) => p.join()))).toEqual(new Set(withHole[1].map((p) => p.join())));
  });

  it('leaves the zone input unchanged', () => {
    const input = { features: [zone('A', square(0, 0, 1, 1))] };
    const copy = JSON.stringify(input);
    buildPermitZoneBounds('x', input);
    expect(JSON.stringify(input)).toBe(copy);
  });

  it('gives a city with no zones an empty zones object', () => {
    expect(buildPermitZoneBounds('x', { features: [] })).toEqual({ city_id: 'x', zones: {} });
  });

  it('passes its own schema', () => {
    const schema = JSON.parse(
      readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'permit-zone-bounds.schema.json'), 'utf8'),
    ) as object;
    const validate = new Ajv({ strict: false }).compile(schema);
    const withHole = [square(0, 0, 10, 10)[0], square(4, 4, 6, 6)[0]];
    const data = buildPermitZoneBounds('burbank', { features: [zone('A', square(0, 0, 1, 1)), zone('C', withHole)] });
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ city_id: 'x', zones: { A: { bounds: [0, 0, 1] } } })).toBe(false);
  });
});
