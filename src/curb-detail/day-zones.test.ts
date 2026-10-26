import { describe, expect, it } from 'vitest';
import type { CurbColorsConfig, SegmentCollection, SideCollection } from '../data-loader';
import { instantFor, isActive } from '../schedule-engine';
import type { Schedule, Weekday } from '../schedule-engine';
import { activeZones, activeZonesHeading, countRows } from './day-zones';
import type { ActiveGroup, ActiveZonesData, ActiveZonesSelection } from './day-zones';

const ZONE = 'America/Los_Angeles';
const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const segments = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { segment_id: 's1', street: 'Olive Avenue', from_street: 'A St', to_street: 'B St' }, geometry: { type: 'LineString', coordinates: [[-118.3, 34.18], [-118.29, 34.18]] } },
    { type: 'Feature', properties: { segment_id: 's2', street: 'Magnolia Boulevard', from_street: 'C St', to_street: 'D St' }, geometry: { type: 'LineString', coordinates: [[-118.3, 34.19], [-118.29, 34.19]] } },
  ],
} as unknown as SegmentCollection;

const line = { type: 'LineString' as const, coordinates: [[-118.3, 34.18], [-118.29, 34.18]] };
const feature = (segment_id: string, side: 'L' | 'R', extra: Record<string, unknown>) => ({
  type: 'Feature' as const,
  properties: { segment_id, city_id: 'x', side, offset: side === 'L' ? 'left' : 'right', ...extra },
  geometry: line,
});
type Row = ReturnType<typeof feature>;
const collection = (...features: Row[]) => ({ type: 'FeatureCollection', features }) as unknown as SideCollection;

const row = (segment_id: string, side: 'L' | 'R', limit: number | null, schedule: Schedule, permit: string | null = null) =>
  feature(segment_id, side, { limit_minutes: limit, permit_code: permit, schedule });
const timed = (...features: Row[]) => collection(...features);
const win = (days: Weekday[], start: string, end: string) => ({ windows: [{ days, start, end }] });
const zoned = (r: Row, permit_zone: string | null): Row => ({ ...r, properties: { ...r.properties, permit_zone } as Row['properties'] });

const data = (over: Partial<ActiveZonesData> = {}): ActiveZonesData => ({
  segments,
  sweeping: collection(),
  timedParking: collection(),
  restrictions: collection(),
  curbColors: collection(),
  curbColorConfig: null,
  ...over,
});

const group = (groups: ActiveGroup[], key: string) => groups.find((g) => g.key === key);
/** The timed parking rows, as the panel listed them before it covered every layer. */
const timedRows = (t: SideCollection, at: ActiveZonesSelection, tz = ZONE) =>
  group(activeZones(data({ timedParking: t }), at, tz), 'timed_parking')?.rows ?? [];
const zonesForDay = (t: SideCollection, day: Weekday) => timedRows(t, { day, hour: 12, mode: 'day' });

describe('timed parking rows in Day mode', () => {
  const parking = timed(
    row('s1', 'L', 120, win(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '08:00', '18:00')),
    row('s1', 'R', 60, win(['sat', 'sun'], '09:00', '17:00'), 'C'),
    row('s2', 'L', 240, null),
    row('s2', 'R', 180, win(['fri'], '22:00', '06:00')),
  );

  it('lists the rows in force on the day, with limit, hours and permit wording', () => {
    const mon = zonesForDay(parking, 'mon');
    expect(mon.map((z) => `${z.street} ${z.side}`)).toEqual(['Magnolia Boulevard L', 'Olive Avenue L']);
    expect(mon[1]).toMatchObject({ rule: '2 hour limit', hours: '08:00–18:00', permit: null });
    expect(mon[0]).toMatchObject({ rule: '4 hour limit', hours: 'all day' });
  });

  it('words a permit code as exempt', () => {
    const sun = zonesForDay(parking, 'sun');
    expect(sun.find((z) => z.side === 'R' && z.street === 'Olive Avenue')).toMatchObject({ rule: '1 hour limit', permit: 'Zone C permit exempt' });
  });

  it('counts the morning end of a window that crossed midnight from the day before', () => {
    expect(zonesForDay(parking, 'sat').find((z) => z.rule === '3 hour limit')?.hours).toBe('until 06:00');
    expect(zonesForDay(parking, 'fri').find((z) => z.rule === '3 hour limit')?.hours).toBe('22:00–06:00 (crosses midnight)');
    expect(zonesForDay(parking, 'thu').some((z) => z.rule === '3 hour limit')).toBe(false);
  });

  it('gives a centre point on the row', () => {
    const [first] = zonesForDay(parking, 'mon');
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
      expect(zonesForDay(set, day).map((z) => z.rule).sort()).toEqual(expected.sort());
    }
  });
});

describe('timed parking rows follow the hour, the mode and the zone', () => {
  const set = timed(
    row('s1', 'L', 120, win(['mon'], '08:00', '12:00')),
    row('s1', 'R', 60, win(['mon'], '14:00', '18:00')),
    row('s2', 'L', 240, null),
  );
  const at = (hour: number, mode: 'hour' | 'day' | 'all' = 'hour', zone = 'all'): ActiveZonesSelection => ({ day: 'mon', hour, mode, zone });
  const limits = (a: ActiveZonesSelection, t = set) => timedRows(t, a).map((z) => z.rule).sort();

  it('lists only rows in force at the chosen hour in Hour mode, and changes with the hour', () => {
    expect(limits(at(9))).toEqual(['2 hour limit', '4 hour limit']);
    expect(limits(at(15))).toEqual(['1 hour limit', '4 hour limit']);
    expect(limits(at(13))).toEqual(['4 hour limit']);
  });

  it('keeps the hour out of it in Day mode, and lists every row in All times mode', () => {
    expect(limits(at(3, 'day'))).toEqual(['1 hour limit', '2 hour limit', '4 hour limit']);
    expect(limits(at(3, 'all'), timed(...(set.features as unknown as Row[]), row('s2', 'R', 30, win(['sun'], '01:00', '02:00'))))).toHaveLength(4);
  });

  it('shows the full schedule in All times mode and the day hours otherwise', () => {
    expect(timedRows(set, at(9, 'all')).find((z) => z.rule === '2 hour limit')?.hours).toBe('Mon 08:00–12:00');
    expect(timedRows(set, at(9)).find((z) => z.rule === '2 hour limit')?.hours).toBe('08:00–12:00');
  });

  it('limits the list to the chosen permit zone, or to rows outside every zone', () => {
    const z = timed(zoned(row('s1', 'L', 120, null), 'C'), zoned(row('s1', 'R', 60, null), 'D'), zoned(row('s2', 'L', 240, null), null));
    expect(limits(at(9, 'hour', 'C'), z)).toEqual(['2 hour limit']);
    expect(limits(at(9, 'hour', 'none'), z)).toEqual(['4 hour limit']);
    expect(limits(at(9, 'hour', 'all'), z)).toHaveLength(3);
  });
});

describe('active zones across every rule layer (M5-9.2)', () => {
  const config = {
    colors: {
      red: { label: 'Red curb', hex: '#ff0000', time_limit_minutes: null, default_schedule: null },
      green: { label: 'Green curb', hex: '#00ff00', time_limit_minutes: 15, default_schedule: win(['mon'], '09:00', '10:00') },
    },
  } as unknown as CurbColorsConfig;

  const all = data({
    sweeping: collection(
      feature('s1', 'L', { schedule: win(['mon'], '08:00', '10:00') }),
      feature('s1', 'R', { schedule: win(['tue'], '08:00', '10:00') }),
    ),
    timedParking: timed(row('s2', 'L', 120, win(['mon'], '08:00', '18:00'), 'C')),
    restrictions: collection(
      feature('s1', 'L', { type: 'no_parking', permit_code: 'C', permit_mode: 'required', schedule: null }),
      feature('s1', 'R', { type: 'no_parking', permit_code: 'D', permit_mode: 'exempt', schedule: win(['mon'], '07:00', '10:00') }),
      feature('s2', 'R', { type: 'no_stopping', permit_code: 'C', permit_mode: 'exempt', schedule: null }),
      feature('s2', 'L', { type: 'no_standing', schedule: win(['mon'], '06:00', '12:00') }),
    ),
    curbColors: collection(
      feature('s1', 'L', { color_key: 'red', schedule: null }),
      feature('s2', 'R', { color_key: 'green', schedule: null }),
      feature('s2', 'L', { color_key: 'green', schedule: win(['tue'], '09:00', '10:00') }),
    ),
    curbColorConfig: config,
  });
  const at: ActiveZonesSelection = { day: 'mon', hour: 9 };
  const keys = (groups: ActiveGroup[]) => groups.map((g) => g.key);

  it('groups the active rows by layer, in layer order, with every layer toggled on', () => {
    const groups = activeZones(all, at, ZONE);
    expect(keys(groups)).toEqual(['sweeping', 'timed_parking', 'restrictions', 'no_stopping', 'curb_colors']);
    expect(groups.map((g) => g.label)).toEqual(['Street sweeping', 'Timed parking', 'Restrictions', 'No stopping / standing', 'Curb colors']);
    expect(groups.map((g) => g.rows.length)).toEqual([1, 1, 2, 2, 2]);
    expect(countRows(groups)).toBe(8);
  });

  it('words each row with its rule, hours and permit wording', () => {
    const groups = activeZones(all, at, ZONE);
    expect(group(groups, 'sweeping')?.rows[0]).toMatchObject({ street: 'Olive Avenue', side: 'L', rule: 'Street sweeping', hours: '08:00–10:00', permit: null });
    const restrictions = group(groups, 'restrictions')?.rows ?? [];
    expect(restrictions.find((r) => r.side === 'L')).toMatchObject({ rule: 'No parking except by permit', hours: 'all day', permit: 'Zone C permit required' });
    expect(restrictions.find((r) => r.side === 'R')).toMatchObject({ rule: 'No parking', hours: '07:00–10:00', permit: 'Zone D permit exempt' });
  });

  it('lists no stopping and no standing without the permit code the layer ignores', () => {
    const rows = group(activeZones(all, at, ZONE), 'no_stopping')?.rows ?? [];
    expect(rows.map((r) => `${r.rule} ${r.side} ${r.permit}`).sort()).toEqual(['No standing L null', 'No stopping R null']);
  });

  it('uses the curb color default schedule when the row has none, and the row own schedule otherwise', () => {
    const rows = group(activeZones(all, at, ZONE), 'curb_colors')?.rows ?? [];
    expect(rows.find((r) => r.rule === 'Red curb')).toMatchObject({ side: 'L', hours: 'all day' });
    expect(rows.find((r) => r.rule === 'Green curb, 15 minute limit')).toMatchObject({ side: 'R', hours: '09:00–10:00' });
    expect(rows.some((r) => r.street === 'Magnolia Boulevard' && r.side === 'L')).toBe(false); // its own Tuesday window
  });

  it('leaves out a layer that is toggled off, and keeps the rest', () => {
    const groups = activeZones(all, { ...at, visible: { sweeping: false, curb_colors: false } }, ZONE);
    expect(keys(groups)).toEqual(['timed_parking', 'restrictions', 'no_stopping']);
    expect(countRows(groups)).toBe(5);
    expect(activeZones(all, { ...at, visible: { sweeping: true, timed_parking: true } }, ZONE)).toHaveLength(5);
  });

  it('keeps a toggled-on layer with nothing in force as an empty group', () => {
    const groups = activeZones(all, { day: 'wed', hour: 3 }, ZONE);
    expect(group(groups, 'sweeping')?.rows).toEqual([]);
    expect(group(groups, 'restrictions')?.rows.map((r) => r.side)).toEqual(['L']); // the all-times one
  });

  it('follows the hour, the day and all times the way the map does', () => {
    expect(group(activeZones(all, { day: 'mon', hour: 12 }, ZONE), 'sweeping')?.rows).toHaveLength(0);
    expect(group(activeZones(all, { day: 'mon', hour: 12, mode: 'day' }, ZONE), 'sweeping')?.rows).toHaveLength(1);
    const every = activeZones(all, { day: 'wed', hour: 3, mode: 'all' }, ZONE);
    expect(every.map((g) => g.rows.length)).toEqual([2, 1, 2, 2, 3]);
    expect(group(every, 'sweeping')?.rows.map((r) => r.hours)).toEqual(['Mon 08:00–10:00', 'Tue 08:00–10:00']);
  });

  it('limits every layer to the chosen permit zone', () => {
    const inZone = (c: SideCollection, zone: string | null): SideCollection =>
      collection(...(c.features as unknown as Row[]).map((f, i) => zoned(f, i % 2 === 0 ? zone : 'Z')));
    const zonedAll = data({
      ...all,
      sweeping: inZone(all.sweeping, 'C'),
      timedParking: inZone(all.timedParking, 'C'),
      restrictions: inZone(all.restrictions, 'C'),
      curbColors: inZone(all.curbColors, null),
    });
    const c = activeZones(zonedAll, { ...at, mode: 'all', zone: 'C' }, ZONE);
    expect(c.map((g) => g.rows.length)).toEqual([1, 1, 1, 1, 0]);
    const none = activeZones(zonedAll, { ...at, mode: 'all', zone: 'none' }, ZONE);
    expect(none.map((g) => g.rows.length)).toEqual([0, 0, 0, 0, 2]);
  });
});

describe('active zones heading', () => {
  const at = (hour: number, mode: 'hour' | 'day' | 'all' = 'hour', zone = 'all'): ActiveZonesSelection => ({ day: 'mon', hour, mode, zone });

  it('words the heading by mode and zone, with the total', () => {
    expect(activeZonesHeading(at(8), 3)).toBe('Active zones: Mon 08:00 (3)');
    expect(activeZonesHeading(at(8, 'day'), 3)).toBe('Active zones: Mon, any time that day (3)');
    expect(activeZonesHeading(at(8, 'all'), 3)).toBe('Active zones: all times (3)');
    expect(activeZonesHeading(at(8, 'hour', 'C'), 1)).toBe('Active zones: Mon 08:00, Zone C (1)');
    expect(activeZonesHeading(at(8, 'hour', 'none'), 0)).toBe('Active zones: Mon 08:00, outside permit zones (0)');
  });
});
