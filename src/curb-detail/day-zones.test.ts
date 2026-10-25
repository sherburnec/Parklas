import { describe, expect, it } from 'vitest';
import type { SegmentCollection, SideCollection } from '../data-loader';
import { instantFor, isActive } from '../schedule-engine';
import type { Schedule, Weekday } from '../schedule-engine';
import { zonesForDay } from './day-zones';

const ZONE = 'America/Los_Angeles';
const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const segments = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { segment_id: 's1', street: 'Olive Avenue', from_street: 'A St', to_street: 'B St' }, geometry: { type: 'LineString', coordinates: [[-118.3, 34.18], [-118.29, 34.18]] } },
    { type: 'Feature', properties: { segment_id: 's2', street: 'Magnolia Boulevard', from_street: 'C St', to_street: 'D St' }, geometry: { type: 'LineString', coordinates: [[-118.3, 34.19], [-118.29, 34.19]] } },
  ],
} as unknown as SegmentCollection;

const row = (segment_id: string, side: 'L' | 'R', limit: number | null, schedule: Schedule, permit: string | null = null) => ({
  type: 'Feature' as const,
  properties: { segment_id, city_id: 'x', side, offset: side === 'L' ? 'left' : 'right', limit_minutes: limit, permit_code: permit, schedule },
  geometry: { type: 'LineString' as const, coordinates: [[-118.3, 34.18], [-118.29, 34.18]] },
});
const win = (days: Weekday[], start: string, end: string) => ({ windows: [{ days, start, end }] });

const timed = (...features: ReturnType<typeof row>[]) => ({ type: 'FeatureCollection', features }) as unknown as SideCollection;

describe('zonesForDay', () => {
  const parking = timed(
    row('s1', 'L', 120, win(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '08:00', '18:00')),
    row('s1', 'R', 60, win(['sat', 'sun'], '09:00', '17:00'), 'C'),
    row('s2', 'L', 240, null),
    row('s2', 'R', 180, win(['fri'], '22:00', '06:00')),
  );

  it('lists the rows in force on the day, with limit, hours and permit wording', () => {
    const mon = zonesForDay(parking, segments, 'mon', ZONE);
    expect(mon.map((z) => `${z.street} ${z.side}`)).toEqual(['Magnolia Boulevard L', 'Olive Avenue L']);
    expect(mon[1]).toMatchObject({ limit: '2 hour limit', hours: '08:00–18:00', permit: null });
    expect(mon[0]).toMatchObject({ limit: '4 hour limit', hours: 'all day' });
  });

  it('words a permit code as exempt', () => {
    const sun = zonesForDay(parking, segments, 'sun', ZONE);
    expect(sun.find((z) => z.side === 'R' && z.street === 'Olive Avenue')).toMatchObject({ limit: '1 hour limit', permit: 'Zone C permit exempt' });
  });

  it('counts the morning end of a window that crossed midnight from the day before', () => {
    const sat = zonesForDay(parking, segments, 'sat', ZONE).find((z) => z.limit === '3 hour limit');
    expect(sat?.hours).toBe('until 06:00');
    expect(zonesForDay(parking, segments, 'fri', ZONE).find((z) => z.limit === '3 hour limit')?.hours).toBe('22:00–06:00 (crosses midnight)');
    expect(zonesForDay(parking, segments, 'thu', ZONE).some((z) => z.limit === '3 hour limit')).toBe(false);
  });

  it('gives a centre point on the row', () => {
    const [first] = zonesForDay(parking, segments, 'mon', ZONE);
    expect(first.center[1]).toBeCloseTo(34.18, 3);
    expect(first.center[0]).toBeGreaterThan(-118.3);
    expect(first.center[0]).toBeLessThan(-118.29);
  });

  it('matches a minute-by-minute scan of the schedule engine for every day', () => {
    const schedules: Schedule[] = [
      null,
      win(['mon'], '08:30', '08:45'),
      win(['sun'], '20:00', '02:00'),
      { windows: [{ days: ['wed'], start: '10:00', end: '12:00', weeks_of_month: [1] }] },
      { windows: [] },
    ];
    const set = timed(...schedules.map((s, i) => row('s1', 'L', 61 + i, s)));
    for (const day of DAYS) {
      const expected = schedules
        .map((s, i) => ({ s, limit: 61 + i }))
        .filter(({ s }) => {
          const base = instantFor(day, 0, ZONE).getTime();
          for (let m = 0; m < 24 * 60; m++) if (isActive(s, new Date(base + m * 60_000), ZONE)) return true;
          return false;
        })
        .map(({ limit }) => `${limit} minute limit`);
      const got = zonesForDay(set, segments, day, ZONE).map((z) => z.limit);
      expect(got.sort()).toEqual(expected.sort());
    }
  });
});
