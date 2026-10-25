import { describe, expect, it } from 'vitest';
import type { SideCollection } from '../data-loader';
import { filterByZone } from './zone-filter';

const side = (segment_id: string, permit_zone: string | null | undefined) => ({
  type: 'Feature' as const,
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 1]] },
  properties: { segment_id, city_id: 'x', side: 'L' as const, offset: 'left' as const, ...(permit_zone === undefined ? {} : { permit_zone }) },
});
const sides: SideCollection = {
  type: 'FeatureCollection',
  features: [side('a', 'C'), side('b', 'D'), side('c', null), side('d', undefined)],
};
const ids = (c: SideCollection) => c.features.map((f) => f.properties.segment_id);

describe('filterByZone', () => {
  it('keeps everything for all, or when no zone is given', () => {
    expect(filterByZone(sides, 'all')).toBe(sides);
    expect(filterByZone(sides, undefined)).toBe(sides);
  });
  it('keeps only sides whose permit_zone matches the code', () => {
    expect(ids(filterByZone(sides, 'C'))).toEqual(['a']);
  });
  it('keeps only sides outside every zone for none', () => {
    expect(ids(filterByZone(sides, 'none'))).toEqual(['c', 'd']);
  });
  it('shows nothing for a code no side has', () => {
    expect(ids(filterByZone(sides, 'H'))).toEqual([]);
  });
});
