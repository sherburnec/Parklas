import { describe, expect, it } from 'vitest';
import type { PolygonCollection, ZoningCategoriesConfig } from '../data-loader';
import { UNKNOWN_ZONE_HEX, zoningLegend, zoningStyle } from './zoning';

const config: ZoningCategoriesConfig = {
  city_id: 'test',
  categories: {
    residential: { label: 'Residential', hex: '#111111' },
    commercial: { label: 'Commercial', hex: '#222222' },
  },
  zone_codes: { R1: 'residential', C1: 'commercial', C2: 'commercial' },
};

const square = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
const zone = (zone_code: string, extra: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  properties: { zone_code, ...extra },
  geometry: { type: 'Polygon' as const, coordinates: square },
});
const zoning = (...codes: string[]): PolygonCollection => ({ type: 'FeatureCollection', features: codes.map((c) => zone(c)) });

describe('zoningStyle', () => {
  it('colors each zone by the category its exact code maps to', () => {
    const out = zoningStyle(zoning('R1', 'C1'), config);
    expect(out.features.map((f) => f.properties.fill_color)).toEqual(['#111111', '#222222']);
    expect(out.features.map((f) => f.properties.category)).toEqual(['residential', 'commercial']);
  });

  it('gives two codes in one category the same color and keeps each exact code', () => {
    const out = zoningStyle(zoning('C1', 'C2'), config);
    expect(out.features[0].properties.fill_color).toBe(out.features[1].properties.fill_color);
    expect(out.features.map((f) => f.properties.zone_code)).toEqual(['C1', 'C2']);
  });

  it('takes the category from the code map, not from a category already on the feature', () => {
    const input: PolygonCollection = { type: 'FeatureCollection', features: [zone('R1', { category: 'commercial' })] };
    expect(zoningStyle(input, config).features[0].properties.category).toBe('residential');
  });

  it('uses the fallback color for a code missing from the map', () => {
    const out = zoningStyle(zoning('ZZ'), config);
    expect(out.features[0].properties.fill_color).toBe(UNKNOWN_ZONE_HEX);
    expect(out.features[0].properties.zone_code).toBe('ZZ');
  });

  it('does not change the input', () => {
    const input = zoning('R1');
    zoningStyle(input, config);
    expect(input.features[0].properties).toEqual({ zone_code: 'R1' });
  });
});

describe('zoningLegend', () => {
  it('has one entry per category with its label and color', () => {
    expect(zoningLegend(config)).toEqual([
      { category: 'residential', label: 'Residential', hex: '#111111' },
      { category: 'commercial', label: 'Commercial', hex: '#222222' },
    ]);
  });
});
