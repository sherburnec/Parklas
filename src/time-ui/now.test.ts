import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentDayHour, nowSelection } from './now';
import { createAppState } from './state';

afterEach(() => vi.useRealTimers());

// Burbank is UTC-8 until 2026-03-08 02:00 local, UTC-7 until 2026-11-01 02:00 local, then UTC-8 again.
const nowAt = (iso: string, timeZone = 'America/Los_Angeles') => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  return currentDayHour(timeZone);
};

describe('currentDayHour (the Now button)', () => {
  it('reads the mocked clock in the city time zone', () => {
    expect(nowAt('2026-01-05T16:45:00Z')).toEqual({ day: 'mon', hour: 8 });
  });

  it('gives the same answer whatever the device zone, because only the city zone is used', () => {
    expect(nowAt('2026-01-05T16:45:00Z', 'Asia/Tokyo')).toEqual({ day: 'tue', hour: 1 });
  });

  it('spring forward: 01:59 PST then 03:00 PDT, no hour 2', () => {
    expect(nowAt('2026-03-08T09:59:00Z')).toEqual({ day: 'sun', hour: 1 });
    expect(nowAt('2026-03-08T10:00:00Z')).toEqual({ day: 'sun', hour: 3 });
  });

  it('fall back: hour 1 happens twice, then 02:00 PST', () => {
    expect(nowAt('2026-11-01T08:30:00Z')).toEqual({ day: 'sun', hour: 1 }); // 01:30 PDT
    expect(nowAt('2026-11-01T09:30:00Z')).toEqual({ day: 'sun', hour: 1 }); // 01:30 PST
    expect(nowAt('2026-11-01T10:00:00Z')).toEqual({ day: 'sun', hour: 2 });
  });

  it('the day rolls over at Burbank midnight on either side of a change', () => {
    expect(nowAt('2026-03-09T06:59:00Z')).toEqual({ day: 'sun', hour: 23 }); // 23:59 PDT
    expect(nowAt('2026-03-09T07:00:00Z')).toEqual({ day: 'mon', hour: 0 });
    expect(nowAt('2026-11-02T07:59:00Z')).toEqual({ day: 'sun', hour: 23 }); // 23:59 PST
    expect(nowAt('2026-11-02T08:00:00Z')).toEqual({ day: 'mon', hour: 0 });
  });
});

describe('nowSelection (the Now button, task M5-8)', () => {
  it('returns to hour mode along with the current day and hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T16:45:00Z'));
    expect(nowSelection('America/Los_Angeles')).toEqual({ day: 'mon', hour: 8, mode: 'hour' });
  });

  it('applied to the state, switches day and all-times modes back to hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T16:45:00Z'));
    for (const mode of ['day', 'all']) {
      const state = createAppState(`?day=sat&hour=2&mode=${mode}`);
      state.set(nowSelection('America/Los_Angeles'));
      expect(state.get()).toMatchObject({ day: 'mon', hour: 8, mode: 'hour' });
    }
  });
});
