import { describe, expect, it } from 'vitest';
import type { SegmentCollection, SideCollection } from '../data-loader';
import { instantFor, isActive } from '../schedule-engine';
import type { Schedule, Weekday } from '../schedule-engine';
import { activeZones, activeZonesHeading } from './day-zones';

const zonesForDay = (t: SideCollection, sg: SegmentCollection, day: Weekday, tz: string) => activeZones(t, sg, { day, hour: 12, mode: 'day' }, tz);

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

describe('activeZones in Day mode', () => {
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

const zoned = (r: ReturnType<typeof row>, permit_zone: string | null) => ({ ...r, properties: { ...r.properties, permit_zone } });

describe('activeZones follows the hour, the mode and the zone', () => {
  const set = timed(
    row('s1', 'L', 120, win(['mon'], '08:00', '12:00')),
    row('s1', 'R', 60, win(['mon'], '14:00', '18:00')),
    row('s2', 'L', 240, null),
  );
  const at = (hour: number, mode: 'hour' | 'day' | 'all' = 'hour', zone = 'all') => ({ day: 'mon' as Weekday, hour, mode, zone });
  const limits = (a: ReturnType<typeof at>, t = set) => activeZones(t, segments, a, ZONE).map((z) => z.limit).sort();

  it('lists only rows in force at the chosen hour in Hour mode, and changes with the hour', () => {
    expect(limits(at(9))).toEqual(['2 hour limit', '4 hour limit']);
    expect(limits(at(15))).toEqual(['1 hour limit', '4 hour limit']);
    expect(limits(at(13))).toEqual(['4 hour limit']);
  });

  it('keeps the hour out of it in Day mode, and lists every row in All times mode', () => {
    expect(limits(at(3, 'day'))).toEqual(['1 hour limit', '2 hour limit', '4 hour limit']);
    expect(limits(at(3, 'all'), timed(...(set.features as unknown as ReturnType<typeof row>[]), row('s2', 'R', 30, win(['sun'], '01:00', '02:00'))))).toHaveLength(4);
  });

  it('shows the full schedule in All times mode and the day hours otherwise', () => {
    const all = activeZones(set, segments, at(9, 'all'), ZONE).find((z) => z.limit === '2 hour limit');
    expect(all?.hours).toBe('Mon 08:00–12:00');
    expect(activeZones(set, segments, at(9), ZONE).find((z) => z.limit === '2 hour limit')?.hours).toBe('08:00–12:00');
  });

  it('limits the list to the chosen permit zone, or to rows outside every zone', () => {
    const z = timed(zoned(row('s1', 'L', 120, null), 'C'), zoned(row('s1', 'R', 60, null), 'D'), zoned(row('s2', 'L', 240, null), null));
    expect(limits(at(9, 'hour', 'C'), z)).toEqual(['2 hour limit']);
    expect(limits(at(9, 'hour', 'none'), z)).toEqual(['4 hour limit']);
    expect(limits(at(9, 'hour', 'all'), z)).toHaveLength(3);
  });

  it('words the heading by mode and zone', () => {
    expect(activeZonesHeading(at(8), 3)).toBe('Active zones: Mon 08:00 (3)');
    expect(activeZonesHeading(at(8, 'day'), 3)).toBe('Active zones: Mon, any time that day (3)');
    expect(activeZonesHeading(at(8, 'all'), 3)).toBe('Active zones: all times (3)');
    expect(activeZonesHeading(at(8, 'hour', 'C'), 1)).toBe('Active zones: Mon 08:00, Zone C (1)');
    expect(activeZonesHeading(at(8, 'hour', 'none'), 0)).toBe('Active zones: Mon 08:00, outside permit zones (0)');
  });
});
