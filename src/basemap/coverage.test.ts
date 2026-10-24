import { describe, expect, it } from 'vitest';
import type { FeatureCollection, LineString } from 'geojson';
import { tagCoverage, UNMAPPED_MESSAGE } from './coverage';

const line = (id: string) => ({
  type: 'Feature' as const,
  properties: { segment_id: id, street: 'Main St' },
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 1]] },
});

const segments: FeatureCollection<LineString, { segment_id: string; street: string }> = {
  type: 'FeatureCollection',
  features: [line('a'), line('b'), line('c')],
};

describe('tagCoverage', () => {
  it('marks only segments listed in coverage as mapped', () => {
    const tagged = tagCoverage(segments, ['b']);
    expect(tagged.features.map((f) => f.properties.mapped)).toEqual([false, true, false]);
  });

  it('treats every segment as unmapped when coverage is empty', () => {
    const tagged = tagCoverage(segments, []);
    expect(tagged.features.every((f) => f.properties.mapped === false)).toBe(true);
  });

  it('keeps existing properties and does not change the input', () => {
    const tagged = tagCoverage(segments, ['a']);
    expect(tagged.features[0].properties).toMatchObject({ segment_id: 'a', street: 'Main St' });
    expect('mapped' in segments.features[0].properties).toBe(false);
  });
});

describe('UNMAPPED_MESSAGE', () => {
  it('says the street is not yet mapped, not that it is unrestricted', () => {
    expect(UNMAPPED_MESSAGE).toBe("Not yet mapped. This street's rules have not been entered.");
  });
});
