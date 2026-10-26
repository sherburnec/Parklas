import { describe, expect, it } from 'vitest';
import type { PermitZoneBounds } from '../data-loader';
import { isolationFor, maskCollection, zoneShownFilter } from './permit-zone-isolation';

const mask = { type: 'Polygon' as const, coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };
const bounds: PermitZoneBounds = { city_id: 'x', zones: { C: { bounds: [0, 0, 1, 1], mask }, D: { bounds: [2, 2, 3, 3], mask } } };

describe('isolationFor', () => {
  it('gives the code, bounds and mask for a permit code', () => {
    expect(isolationFor('C', bounds)).toEqual({ code: 'C', bounds: [0, 0, 1, 1], mask });
  });
  it('gives nothing for all, none or a code the zones do not have', () => {
    expect(isolationFor('all', bounds)).toBeNull();
    expect(isolationFor('none', bounds)).toBeNull();
    expect(isolationFor('Z', bounds)).toBeNull();
  });
  it('gives nothing when the city has no bounds file', () => {
    expect(isolationFor('C', null)).toBeNull();
  });
});

describe('zoneShownFilter', () => {
  it('shows every polygon when nothing is isolated', () => {
    expect(zoneShownFilter(null)).toBeNull();
  });
  it('shows only the isolated zone otherwise', () => {
    expect(zoneShownFilter('C')).toEqual(['==', ['get', 'permit_code'], 'C']);
  });
});

describe('maskCollection', () => {
  it('holds the mask as one feature while isolated, and nothing otherwise', () => {
    expect(maskCollection(isolationFor('C', bounds)).features.map((f) => f.geometry)).toEqual([mask]);
    expect(maskCollection(null).features).toEqual([]);
  });
});
