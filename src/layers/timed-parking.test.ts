import { describe, expect, it } from 'vitest';
import type { Schedule, SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import { FALLBACK_LIMIT_HEX, LIMIT_HEX, TIMED_PARKING_BAND, timedParkingStyle } from './timed-parking';
import { SWEEPING_BAND } from './sweeping';

const side = (limit: number | null, schedule: Schedule, offset: 'left' | 'right' = 'left') => ({
  type: 'Feature' as const,
  properties: { segment_id: 's', city_id: 'test', side: 'L' as const, offset, limit_minutes: limit, schedule },
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 0]] },
});
const collection = (...features: ReturnType<typeof side>[]): SideCollection => ({ type: 'FeatureCollection', features });

const monSat8to18: Schedule = { windows: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '08:00', end: '18:00' }] };
const TZ = 'America/Los_Angeles';

describe('timedParkingStyle: active', () => {
  it('toggles with the hour', () => {
    const hours = [7, 8, 17, 18].map(
      (h) => timedParkingStyle(collection(side(120, monSat8to18)), { day: 'mon', hour: h }, TZ).features[0].properties.active,
    );
    expect(hours).toEqual([false, true, true, false]);
  });

  it('is inactive on a day outside the schedule', () => {
    const out = timedParkingStyle(collection(side(120, monSat8to18)), { day: 'sun', hour: 10 }, TZ);
    expect(out.features[0].properties.active).toBe(false);
  });

  it('treats a null schedule as always active', () => {
    const out = timedParkingStyle(collection(side(60, null)), { day: 'sun', hour: 3 }, TZ);
    expect(out.features[0].properties.active).toBe(true);
  });

  it('adds the sign and keeps the input unchanged', () => {
    const input = collection(side(60, null, 'right'), side(60, null, 'left'));
    const out = timedParkingStyle(input, { day: 'mon', hour: 8 }, TZ);
    expect(out.features.map((f) => f.properties.sgn)).toEqual([1, -1]);
    expect('active' in input.features[0].properties).toBe(false);
  });
});

describe('timedParkingStyle: style per limit', () => {
  const hexOf = (limit: number | null) =>
    timedParkingStyle(collection(side(limit, null)), { day: 'mon', hour: 8 }, TZ).features[0].properties.hex;

  it('gives 60, 120, 180 and 240 minutes four different colors', () => {
    const hexes = [60, 120, 180, 240].map(hexOf);
    expect(new Set(hexes).size).toBe(4);
    expect(hexes).toEqual([60, 120, 180, 240].map((m) => LIMIT_HEX[m]));
  });

  it('gives any other limit the fallback color, different from every listed one', () => {
    expect(hexOf(30)).toBe(FALLBACK_LIMIT_HEX);
    expect(hexOf(null)).toBe(FALLBACK_LIMIT_HEX);
    expect(Object.values(LIMIT_HEX)).not.toContain(FALLBACK_LIMIT_HEX);
  });
});

describe('timed parking band slot', () => {
  it('has its own slot, apart from sweeping, read from the shared config', () => {
    expect(TIMED_PARKING_BAND).toBe(bandSlot('timed_parking'));
    expect(TIMED_PARKING_BAND).not.toBe(SWEEPING_BAND);
  });
});
