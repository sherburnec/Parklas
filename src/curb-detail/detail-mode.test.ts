import { describe, expect, it } from 'vitest';
import type { SegmentCollection, SideCollection, TrimData } from '../data-loader';
import type { Weekday } from '../schedule-engine';
import { describeSegment } from './detail';
import type { DetailData, DetailTime } from './detail';
import { modeNote } from './format';

const ZONE = 'America/Los_Angeles';
const ID = 'test-1-2';

type Window = { days: Weekday[]; start: string; end: string; weeks_of_month?: number[] };

/** One block with a single sweeping row on side L. `windows` null is an always-in-force schedule. */
function oneRule(windows: Window[] | null): DetailData {
  const coordinates = [[-118.3, 34.18], [-118.299, 34.18]];
  const empty = { type: 'FeatureCollection', features: [] } as unknown as SideCollection;
  return {
    segments: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { segment_id: ID, street: 'Test Street', from_street: 'A', to_street: 'B' }, geometry: { type: 'LineString', coordinates } },
      ],
    } as unknown as SegmentCollection,
    sweeping: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { segment_id: ID, city_id: 'test', side: 'L', offset: 'left', schedule: windows === null ? null : { windows } },
          geometry: { type: 'LineString', coordinates },
        },
      ],
    } as unknown as SideCollection,
    timedParking: empty,
    restrictions: empty,
    curbColors: empty,
    coverage: { city_id: 'test', segment_ids: [ID] } as unknown as DetailData['coverage'],
    trim: { segments: {} } as unknown as TrimData,
    curbColorConfig: null,
    blocks: null,
  };
}

const rule = (d: DetailData, at: DetailTime) => describeSegment(d, ID, at, ZONE).sides.find((s) => s.side === 'L')!.rules[0];
const monNight = oneRule([{ days: ['mon'], start: '18:00', end: '06:00' }]);

describe('describeSegment by time mode (task M5-8)', () => {
  it('hour mode is unchanged: the full schedule, and the state and next change at the hour', () => {
    const r = rule(monNight, { day: 'mon', hour: 8 });
    expect(r.scheduleLabel).toBe('Schedule');
    expect(r.scheduleText).toBe('Mon 18:00–06:00 (crosses midnight)');
    expect(r.active).toBe(false);
    expect(r.status).toBe('Not active, next change Mon 18:00');
    expect(rule(monNight, { day: 'mon', hour: 8, mode: 'hour' })).toEqual(r);
  });

  it('day mode lists the windows on that day: the start, the tail, or "Not active today"', () => {
    expect(rule(monNight, { day: 'mon', hour: 8, mode: 'day' })).toMatchObject({
      active: true, scheduleLabel: 'Mon', scheduleText: '18:00–06:00 (crosses midnight)', status: '',
    });
    expect(rule(monNight, { day: 'tue', hour: 8, mode: 'day' })).toMatchObject({
      active: true, scheduleLabel: 'Tue', scheduleText: 'until 06:00',
    });
    expect(rule(monNight, { day: 'wed', hour: 8, mode: 'day' })).toMatchObject({
      active: false, scheduleLabel: 'Wed', scheduleText: 'Not active today',
    });
  });

  it('day mode does not depend on the hour', () => {
    const texts = [0, 7, 23].map((hour) => rule(monNight, { day: 'tue', hour, mode: 'day' }).scheduleText);
    expect(texts).toEqual(['until 06:00', 'until 06:00', 'until 06:00']);
  });

  it('day mode lists a window that both ends and begins on one day', () => {
    const nightly = oneRule([{ days: ['mon', 'tue'], start: '22:00', end: '02:00' }]);
    expect(rule(nightly, { day: 'tue', hour: 0, mode: 'day' }).scheduleText).toBe('until 02:00, 22:00–02:00 (crosses midnight)');
  });

  it('day mode lists several windows in order, and says "all day" for a null schedule', () => {
    const two = oneRule([{ days: ['mon'], start: '16:00', end: '18:00' }, { days: ['mon'], start: '06:00', end: '08:00' }]);
    expect(rule(two, { day: 'mon', hour: 0, mode: 'day' }).scheduleText).toBe('06:00–08:00, 16:00–18:00');
    expect(rule(oneRule(null), { day: 'sun', hour: 0, mode: 'day' })).toMatchObject({ active: true, scheduleText: 'all day' });
  });

  it('day mode honours week of month, with the day picker on the reference week', () => {
    // The reference Monday is 2026-01-05, week 1 of the month.
    const weekOne = oneRule([{ days: ['mon'], start: '08:00', end: '10:00', weeks_of_month: [1] }]);
    expect(rule(weekOne, { day: 'mon', hour: 0, mode: 'day' }).scheduleText).toBe('08:00–10:00');
    const weekTwo = oneRule([{ days: ['mon'], start: '08:00', end: '10:00', weeks_of_month: [2] }]);
    expect(rule(weekTwo, { day: 'mon', hour: 0, mode: 'day' }).scheduleText).toBe('Not active today');
  });

  it('all times mode lists the full schedule and shows the rule as active', () => {
    expect(rule(monNight, { day: 'wed', hour: 8, mode: 'all' })).toMatchObject({
      active: true, scheduleLabel: 'Schedule', scheduleText: 'Mon 18:00–06:00 (crosses midnight)', status: '',
    });
    expect(rule(oneRule(null), { day: 'wed', hour: 8, mode: 'all' }).scheduleText).toBe('none (always in force)');
  });
});

describe('modeNote', () => {
  it('names the mode that is on', () => {
    expect(modeNote({ day: 'mon', hour: 8 })).toBe('Hour mode: next changes counted from Mon 08:00.');
    expect(modeNote({ day: 'mon', hour: 8, mode: 'hour' })).toBe('Hour mode: next changes counted from Mon 08:00.');
    expect(modeNote({ day: 'tue', hour: 8, mode: 'day' })).toBe('Day mode: each rule’s windows on Tue.');
    expect(modeNote({ day: 'tue', hour: 8, mode: 'all' })).toBe('All times mode: each rule’s full schedule.');
  });
});
