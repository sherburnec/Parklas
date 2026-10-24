import { describe, expect, it } from 'vitest';
import type { Schedule, SideCollection } from '../data-loader';
import { instantFor } from '../schedule-engine';
import { sweepingStyle } from './sweeping';

const side = (schedule: Schedule, offset: 'left' | 'right' = 'left') => ({
  type: 'Feature' as const,
  properties: { segment_id: 's', city_id: 'test', side: 'L' as const, offset, schedule },
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 0]] },
});
const collection = (...features: ReturnType<typeof side>[]): SideCollection => ({ type: 'FeatureCollection', features });

const mon8to10: Schedule = { windows: [{ days: ['mon'], start: '08:00', end: '10:00' }] };

describe('sweepingStyle', () => {
  it('marks a side active only inside its window, hour by hour', () => {
    const hours = [7, 8, 9, 10].map(
      (h) => sweepingStyle(collection(side(mon8to10)), { day: 'mon', hour: h }, 'America/Los_Angeles').features[0].properties.active,
    );
    expect(hours).toEqual([false, true, true, false]);
  });

  it('marks a side inactive on another day', () => {
    const out = sweepingStyle(collection(side(mon8to10)), { day: 'tue', hour: 8 }, 'America/Los_Angeles');
    expect(out.features[0].properties.active).toBe(false);
  });

  it('treats a null schedule as always active', () => {
    const out = sweepingStyle(collection(side(null)), { day: 'sun', hour: 3 }, 'America/Los_Angeles');
    expect(out.features[0].properties.active).toBe(true);
  });

  it('adds a sign: +1 for the right of travel, -1 for the left', () => {
    const out = sweepingStyle(collection(side(null, 'right'), side(null, 'left')), { day: 'mon', hour: 8 }, 'America/Los_Angeles');
    expect(out.features.map((f) => f.properties.sgn)).toEqual([1, -1]);
  });

  it('keeps the original properties and does not change the input', () => {
    const input = collection(side(mon8to10));
    const out = sweepingStyle(input, { day: 'mon', hour: 8 }, 'America/Los_Angeles');
    expect(out.features[0].properties.segment_id).toBe('s');
    expect('active' in input.features[0].properties).toBe(false);
  });

  it('reads the hour on the given time zone', () => {
    // 08:00 on the UTC clock is 00:00 in Los Angeles, so it falls outside a 08:00 to 10:00 window there.
    const at = { day: 'mon' as const, hour: 8 };
    expect(instantFor(at.day, at.hour, 'UTC').toISOString()).toBe('2026-01-05T08:00:00.000Z');
    expect(sweepingStyle(collection(side(mon8to10)), at, 'UTC').features[0].properties.active).toBe(true);
  });
});
