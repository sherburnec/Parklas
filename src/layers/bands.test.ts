import { describe, expect, it } from 'vitest';
import type { SegmentTrim, SideCollection, TrimData } from '../data-loader';
import { bandOffsetPx, bandWidthPx, layoutBands } from './bands';

const M_PER_DEG_LAT = 111_320;
// A straight block running north from the equator, 100 m long, so longitude stays put and metres are easy to read.
const LENGTH_M = 100;
const line = [[0, 0], [0, LENGTH_M / M_PER_DEG_LAT]];

const flat: SegmentTrim = { trim_start_m: 0, trim_end_m: 0, sliver: false, inner_L: false, inner_R: false };
const trimOf = (segments: Record<string, Partial<SegmentTrim>>): TrimData => ({
  city_id: 'test',
  segments: Object.fromEntries(Object.entries(segments).map(([id, t]) => [id, { ...flat, ...t }])),
});
const side = (segment_id: string, s: 'L' | 'R') => ({
  type: 'Feature' as const,
  properties: { segment_id, city_id: 'test', side: s, offset: s === 'L' ? ('left' as const) : ('right' as const) },
  geometry: { type: 'LineString' as const, coordinates: line },
});
const collection = (...features: ReturnType<typeof side>[]): SideCollection => ({ type: 'FeatureCollection', features });
const lengthM = (coords: number[][]) => Math.abs(coords[coords.length - 1][1] - coords[0][1]) * M_PER_DEG_LAT;

describe('layoutBands: trim', () => {
  it('cuts a band by trim_start_m at the start and trim_end_m at the end', () => {
    const { drawn } = layoutBands(collection(side('a', 'R')), trimOf({ a: { trim_start_m: 10, trim_end_m: 25 } }));
    const coords = drawn.features[0].geometry.coordinates;
    expect(lengthM(coords)).toBeCloseTo(65, 1);
    expect(coords[0][1] * M_PER_DEG_LAT).toBeCloseTo(10, 1);
    expect(coords[coords.length - 1][1] * M_PER_DEG_LAT).toBeCloseTo(75, 1);
  });

  it('leaves a band uncut when the segment has no trim entry, and does not change the input', () => {
    const input = collection(side('a', 'R'));
    const { drawn } = layoutBands(input, trimOf({}));
    expect(drawn.features[0].geometry.coordinates).toEqual(line);
    expect(input.features[0].geometry.coordinates).toEqual(line);
  });

  it('keeps the other properties of a drawn side', () => {
    const { drawn } = layoutBands(collection(side('a', 'L')), trimOf({ a: {} }));
    expect(drawn.features[0].properties).toMatchObject({ segment_id: 'a', side: 'L', offset: 'left' });
  });
});

describe('layoutBands: inner-facing sides', () => {
  const trim = trimOf({ a: { inner_L: true } });
  const sides = collection(side('a', 'L'), side('a', 'R'));

  it('does not draw the inner side but draws the outer one', () => {
    const { drawn } = layoutBands(sides, trim);
    expect(drawn.features.map((f) => f.properties.side)).toEqual(['R']);
  });

  it('still returns the hidden inner side as data, and leaves the source collection whole', () => {
    const { hidden } = layoutBands(sides, trim);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toMatchObject({ reason: 'inner' });
    expect(hidden[0].feature?.properties).toMatchObject({ segment_id: 'a', side: 'L' });
    expect(sides.features).toHaveLength(2);
  });
});

describe('layoutBands: slivers', () => {
  const trim = trimOf({ short: { sliver: true }, other: { sliver: true } });

  it('draws a sliver that has a rule row', () => {
    const { drawn, hidden } = layoutBands(collection(side('short', 'R')), trimOf({ short: { sliver: true } }));
    expect(drawn.features.map((f) => f.properties.segment_id)).toEqual(['short']);
    expect(hidden).toEqual([]);
  });

  it('does not draw a sliver that has no rule row, and reports it as skipped', () => {
    const { drawn, hidden } = layoutBands(collection(side('short', 'R')), trim);
    expect(drawn.features.map((f) => f.properties.segment_id)).toEqual(['short']);
    expect(hidden).toEqual([{ segment_id: 'other', reason: 'sliver-no-rule' }]);
  });

  it('does not report a non-sliver without rows as skipped', () => {
    expect(layoutBands(collection(), trimOf({ long: {} })).hidden).toEqual([]);
  });
});

describe('band geometry from the shared config', () => {
  it('first band sits 2 px from the centerline, 2 px wide, at z17', () => {
    expect(bandOffsetPx(0)).toBe(2);
    expect(bandWidthPx()).toBe(2);
  });

  it('later bands step out by 2 px', () => {
    expect(bandOffsetPx(1)).toBe(4);
    expect(bandOffsetPx(2)).toBe(6);
  });
});
