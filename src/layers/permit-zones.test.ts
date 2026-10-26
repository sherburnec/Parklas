import { describe, expect, it } from 'vitest';
import type { PolygonCollection } from '../data-loader';
import { PERMIT_ZONE_FILL_OPACITY, PERMIT_ZONE_HEXES, permitZoneLegend, permitZoneStyle, zoneFillOpacity } from './permit-zones';

const square = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
const zone = (permit_code: unknown) => ({
  type: 'Feature' as const,
  properties: { permit_code },
  geometry: { type: 'Polygon' as const, coordinates: square },
});
const zones = (...codes: unknown[]): PolygonCollection => ({ type: 'FeatureCollection', features: codes.map(zone) });

describe('permitZoneStyle', () => {
  it('gives every zone its own color and a label equal to its permit code', () => {
    const out = permitZoneStyle(zones('B', 'A', 'C'));
    expect(out.features.map((f) => f.properties.label)).toEqual(['B', 'A', 'C']);
    expect(new Set(out.features.map((f) => f.properties.hex)).size).toBe(3);
  });

  it('colors by code order, so a zone keeps its color whatever order the file lists it in', () => {
    const a = permitZoneStyle(zones('A', 'B')).features;
    const b = permitZoneStyle(zones('B', 'A')).features;
    expect(a[0].properties.hex).toBe(b[1].properties.hex);
    expect(a[1].properties.hex).toBe(b[0].properties.hex);
  });

  it('has enough colors for the eight zones A to H', () => {
    expect(new Set(PERMIT_ZONE_HEXES).size).toBeGreaterThanOrEqual(8);
  });

  it('keeps working with more zones than colors by reusing colors', () => {
    const codes = Array.from({ length: PERMIT_ZONE_HEXES.length + 2 }, (_, i) => `Z${String(i).padStart(2, '0')}`);
    const out = permitZoneStyle(zones(...codes));
    expect(out.features.every((f) => typeof f.properties.hex === 'string')).toBe(true);
  });

  it('does not change the input', () => {
    const input = zones('A');
    permitZoneStyle(input);
    expect(input.features[0].properties).toEqual({ permit_code: 'A' });
  });
});

describe('permitZoneLegend', () => {
  it('lists each code once, sorted, with the color its polygon uses', () => {
    const input = zones('DEMO-B', 'DEMO-A', 'DEMO-B');
    const styled = permitZoneStyle(input);
    const legend = permitZoneLegend(input);
    expect(legend.map((e) => e.code)).toEqual(['DEMO-A', 'DEMO-B']);
    expect(legend[0].hex).toBe(styled.features[1].properties.hex);
    expect(legend[1].hex).toBe(styled.features[0].properties.hex);
  });

  it('is empty when there are no zones', () => {
    expect(permitZoneLegend(zones())).toEqual([]);
  });
});

describe('zone fill opacity (M5-9.2)', () => {
  it('keeps the fill values in one constant, with a highlighted zone lighter than the rest', () => {
    expect(PERMIT_ZONE_FILL_OPACITY.selected).toBeGreaterThan(0);
    expect(PERMIT_ZONE_FILL_OPACITY.selected).toBeLessThan(PERMIT_ZONE_FILL_OPACITY.all);
  });

  it('is the plain base value with no zone highlighted', () => {
    expect(zoneFillOpacity(null)).toBe(PERMIT_ZONE_FILL_OPACITY.all);
  });

  it('gives only the highlighted zone the lighter value, and the others the base value', () => {
    expect(zoneFillOpacity('C')).toEqual([
      'case', ['==', ['get', 'permit_code'], 'C'], PERMIT_ZONE_FILL_OPACITY.selected, PERMIT_ZONE_FILL_OPACITY.all,
    ]);
  });
});
