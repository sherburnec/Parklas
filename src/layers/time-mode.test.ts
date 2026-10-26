import { describe, expect, it } from 'vitest';
import type { CurbColorsConfig, Schedule, SideCollection } from '../data-loader';
import { curbColorStyle } from './curb-colors';
import { filterByZone } from './zone-filter';
import { noStoppingStyle } from './no-stopping';
import { restrictionsStyle } from './restrictions';
import { isScheduleActive, sweepingStyle } from './sweeping';
import type { TimeSelection } from './sweeping';
import { timedParkingStyle } from './timed-parking';

const TZ = 'America/Los_Angeles';
const monNight: Schedule = { windows: [{ days: ['mon'], start: '18:00', end: '06:00' }] };

const row = (schedule: Schedule, extra: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  properties: { segment_id: 's', city_id: 'test', side: 'L' as const, offset: 'left' as const, schedule, ...extra },
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 0]] },
});
const collection = (...features: ReturnType<typeof row>[]): SideCollection => ({ type: 'FeatureCollection', features });
const activeOf = (c: SideCollection): boolean[] => c.features.map((f) => f.properties.active as boolean);

const select = (day: TimeSelection['day'], hour: number, mode?: TimeSelection['mode']): TimeSelection => ({ day, hour, mode });

describe('isScheduleActive (the one shared helper)', () => {
  it('hour mode, and an absent mode, read the hour', () => {
    expect(isScheduleActive(monNight, select('mon', 17), TZ)).toBe(false);
    expect(isScheduleActive(monNight, select('mon', 18), TZ)).toBe(true);
    expect(isScheduleActive(monNight, select('mon', 18, 'hour'), TZ)).toBe(true);
    expect(isScheduleActive(monNight, select('tue', 5), TZ)).toBe(true);
    expect(isScheduleActive(monNight, select('tue', 6), TZ)).toBe(false);
  });

  it('day mode ignores the hour and counts a window carried over midnight', () => {
    for (const hour of [0, 9, 17, 23]) {
      expect(isScheduleActive(monNight, select('mon', hour, 'day'), TZ)).toBe(true);
      expect(isScheduleActive(monNight, select('tue', hour, 'day'), TZ)).toBe(true);
      expect(isScheduleActive(monNight, select('wed', hour, 'day'), TZ)).toBe(false);
    }
  });

  it('day mode treats null as active and a daytime window on another day as inactive', () => {
    const fri: Schedule = { windows: [{ days: ['fri'], start: '08:00', end: '10:00' }] };
    expect(isScheduleActive(null, select('sun', 3, 'day'), TZ)).toBe(true);
    expect(isScheduleActive(fri, select('mon', 9, 'day'), TZ)).toBe(false);
    expect(isScheduleActive(fri, select('fri', 23, 'day'), TZ)).toBe(true);
  });

  it('all mode is active for every rule, even one that is never in force', () => {
    expect(isScheduleActive(monNight, select('wed', 12, 'all'), TZ)).toBe(true);
    expect(isScheduleActive({ windows: [] }, select('wed', 12, 'all'), TZ)).toBe(true);
    expect(isScheduleActive(null, select('wed', 12, 'all'), TZ)).toBe(true);
  });
});

describe('every layer follows the mode', () => {
  const mode = (m: TimeSelection['mode']) => select('wed', 12, m);
  const curbConfig = {
    city_id: 'test',
    colors: { red: { label: 'Red', hex: '#f00', time_limit_minutes: null, default_schedule: monNight } },
  } as unknown as CurbColorsConfig;

  const layers: Record<string, (m: TimeSelection['mode']) => boolean[]> = {
    sweeping: (m) => activeOf(sweepingStyle(collection(row(monNight)), mode(m), TZ)),
    'timed parking': (m) => activeOf(timedParkingStyle(collection(row(monNight, { limit_minutes: 60 })), mode(m), TZ)),
    restrictions: (m) => activeOf(restrictionsStyle(collection(row(monNight, { type: 'no_parking' })), mode(m), TZ)),
    'no stopping': (m) => activeOf(noStoppingStyle(collection(row(monNight, { type: 'no_stopping' })), mode(m), TZ)),
    // No schedule on the row, so the color's default (Mon night) is what the mode reads.
    'curb colors': (m) => activeOf(curbColorStyle(collection(row(null, { color_key: 'red' })), curbConfig, mode(m), TZ)),
  };

  for (const [name, run] of Object.entries(layers)) {
    it(`${name}: Wednesday noon is inactive in hour and day mode, active in all times`, () => {
      expect(run(undefined)).toEqual([false]);
      expect(run('hour')).toEqual([false]);
      expect(run('day')).toEqual([false]);
      expect(run('all')).toEqual([true]);
    });
  }

  it('Tuesday in day mode makes every layer active through the carried-over window', () => {
    const tue = { day: 'tue' as const, hour: 12, mode: 'day' as const };
    expect(activeOf(sweepingStyle(collection(row(monNight)), tue, TZ))).toEqual([true]);
    expect(activeOf(timedParkingStyle(collection(row(monNight)), tue, TZ))).toEqual([true]);
    expect(activeOf(restrictionsStyle(collection(row(monNight, { type: 'no_parking' })), tue, TZ))).toEqual([true]);
    expect(activeOf(noStoppingStyle(collection(row(monNight, { type: 'no_stopping' })), tue, TZ))).toEqual([true]);
  });
});

describe('the zone filter in every mode', () => {
  it('limits the sides the same way whatever the mode', () => {
    const sides = collection(row(null, { permit_zone: 'A' }), row(null, { permit_zone: 'B' }), row(null, { permit_zone: null }));
    for (const mode of ['hour', 'day', 'all'] as const) {
      const at = { day: 'mon' as const, hour: 8, mode };
      const one = sweepingStyle(filterByZone(sides, 'A'), at, TZ);
      expect(one.features.map((f) => f.properties.permit_zone)).toEqual(['A']);
      const none = sweepingStyle(filterByZone(sides, 'none'), at, TZ);
      expect(none.features.map((f) => f.properties.permit_zone)).toEqual([null]);
      expect(sweepingStyle(filterByZone(sides, 'all'), at, TZ).features).toHaveLength(3);
    }
  });
});
