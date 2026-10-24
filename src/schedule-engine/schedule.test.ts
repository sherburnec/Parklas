import { describe, expect, it } from 'vitest';
import { isActive, nextChange } from './index';
import type { Schedule } from './index';

// All instants are written in UTC. Burbank is UTC-8 (PST) until 2026-03-08
// 02:00 local, UTC-7 (PDT) until 2026-11-01 02:00 local, then UTC-8 again.
const at = (iso: string) => new Date(iso);

describe('null and empty schedules', () => {
  it('null is always in force and never changes', () => {
    const d = at('2026-01-05T12:00:00Z');
    expect(isActive(null, d)).toBe(true);
    expect(nextChange(null, d)).toBeNull();
  });

  it('a schedule with no windows is never active and never changes', () => {
    const d = at('2026-01-05T12:00:00Z');
    expect(isActive({ windows: [] }, d)).toBe(false);
    expect(nextChange({ windows: [] }, d)).toBeNull();
  });

  it('a window with no days is never active and never changes', () => {
    const s: Schedule = { windows: [{ days: [], start: '08:00', end: '17:00' }] };
    expect(isActive(s, at('2026-01-05T20:00:00Z'))).toBe(false);
    expect(nextChange(s, at('2026-01-05T20:00:00Z'))).toBeNull();
  });
});

describe('same-day window', () => {
  // Mon 2026-01-05, 09:00-17:00 PST = 17:00Z-01:00Z
  const s: Schedule = { windows: [{ days: ['mon'], start: '09:00', end: '17:00' }] };

  it('includes start, excludes end', () => {
    expect(isActive(s, at('2026-01-05T16:59:00Z'))).toBe(false);
    expect(isActive(s, at('2026-01-05T17:00:00Z'))).toBe(true);
    expect(isActive(s, at('2026-01-06T00:59:00Z'))).toBe(true);
    expect(isActive(s, at('2026-01-06T01:00:00Z'))).toBe(false);
  });

  it('is inactive on other days', () => {
    expect(isActive(s, at('2026-01-06T18:00:00Z'))).toBe(false);
  });

  it('nextChange gives the next start or end, strictly after the given time', () => {
    expect(nextChange(s, at('2026-01-05T12:00:00Z'))).toEqual(at('2026-01-05T17:00:00Z'));
    expect(nextChange(s, at('2026-01-05T17:00:00Z'))).toEqual(at('2026-01-06T01:00:00Z'));
    // After the end, the next start is a week away.
    expect(nextChange(s, at('2026-01-06T01:00:00Z'))).toEqual(at('2026-01-12T17:00:00Z'));
  });

  it('adjacent windows are one continuous stretch', () => {
    const adj: Schedule = {
      windows: [
        { days: ['mon'], start: '08:00', end: '12:00' },
        { days: ['mon'], start: '12:00', end: '17:00' },
      ],
    };
    expect(isActive(adj, at('2026-01-05T20:00:00Z'))).toBe(true); // 12:00 local
    expect(nextChange(adj, at('2026-01-05T17:00:00Z'))).toEqual(at('2026-01-06T01:00:00Z'));
  });

  it('uses the city time zone, not UTC', () => {
    // 2026-01-06T02:00Z is still Monday 18:00 in Los Angeles.
    const evening: Schedule = { windows: [{ days: ['mon'], start: '18:00', end: '19:00' }] };
    expect(isActive(evening, at('2026-01-06T02:00:00Z'))).toBe(true);
    expect(isActive(evening, at('2026-01-06T02:00:00Z'), 'UTC')).toBe(false);
  });
});

describe('midnight crossing', () => {
  // Mon 18:00 to Tue 06:00
  const s: Schedule = { windows: [{ days: ['mon'], start: '18:00', end: '06:00' }] };

  it('is active Monday evening and Tuesday early morning', () => {
    expect(isActive(s, at('2026-01-06T01:59:00Z'))).toBe(false); // Mon 17:59
    expect(isActive(s, at('2026-01-06T02:00:00Z'))).toBe(true); // Mon 18:00
    expect(isActive(s, at('2026-01-06T13:59:00Z'))).toBe(true); // Tue 05:59
    expect(isActive(s, at('2026-01-06T14:00:00Z'))).toBe(false); // Tue 06:00
  });

  it('is not active early Monday morning', () => {
    expect(isActive(s, at('2026-01-05T13:00:00Z'))).toBe(false); // Mon 05:00
  });

  it('nextChange finds the end on the following day', () => {
    expect(nextChange(s, at('2026-01-06T03:00:00Z'))).toEqual(at('2026-01-06T14:00:00Z'));
    expect(nextChange(s, at('2026-01-05T20:00:00Z'))).toEqual(at('2026-01-06T02:00:00Z'));
  });

  it('nextChange from early in the crossed-into day finds that morning end', () => {
    expect(nextChange(s, at('2026-01-06T10:00:00Z'))).toEqual(at('2026-01-06T14:00:00Z'));
  });
});

describe('Sunday into Monday', () => {
  // Sun 20:00 to Mon 04:00
  const s: Schedule = { windows: [{ days: ['sun'], start: '20:00', end: '04:00' }] };

  it('wraps from the end of the week to the start', () => {
    // Sun 2026-01-04 20:00 PST = Jan 5 04:00Z
    expect(isActive(s, at('2026-01-05T04:00:00Z'))).toBe(true);
    expect(isActive(s, at('2026-01-05T10:00:00Z'))).toBe(true); // Mon 02:00
    expect(isActive(s, at('2026-01-05T11:59:00Z'))).toBe(true); // Mon 03:59
    expect(isActive(s, at('2026-01-05T12:00:00Z'))).toBe(false); // Mon 04:00
  });

  it('is not active Monday night', () => {
    expect(isActive(s, at('2026-01-06T04:00:00Z'))).toBe(false); // Mon 20:00
  });

  it('nextChange from Monday 02:00 is Monday 04:00; then next Sunday 20:00', () => {
    expect(nextChange(s, at('2026-01-05T10:00:00Z'))).toEqual(at('2026-01-05T12:00:00Z'));
    expect(nextChange(s, at('2026-01-05T12:00:00Z'))).toEqual(at('2026-01-12T04:00:00Z'));
  });

  it('a Saturday window runs into Sunday', () => {
    const sat: Schedule = { windows: [{ days: ['sat'], start: '22:00', end: '06:00' }] };
    expect(isActive(sat, at('2026-01-04T10:00:00Z'))).toBe(true); // Sun 02:00
    expect(isActive(sat, at('2026-01-04T14:00:00Z'))).toBe(false); // Sun 06:00
  });
});

describe('week of month', () => {
  // Days 1-7 are week 1, 8-14 week 2, 15-21 week 3, 22-28 week 4, 29-31 week 5.
  const firstThird: Schedule = {
    windows: [{ days: ['mon'], start: '08:00', end: '10:00', weeks_of_month: [1, 3] }],
  };

  it('is active only on the listed weeks', () => {
    expect(isActive(firstThird, at('2026-01-05T17:00:00Z'))).toBe(true); // Jan 5, week 1
    expect(isActive(firstThird, at('2026-01-12T17:00:00Z'))).toBe(false); // Jan 12, week 2
    expect(isActive(firstThird, at('2026-01-19T17:00:00Z'))).toBe(true); // Jan 19, week 3
    expect(isActive(firstThird, at('2026-01-26T17:00:00Z'))).toBe(false); // Jan 26, week 4
  });

  it('absent weeks_of_month means every week', () => {
    const every: Schedule = { windows: [{ days: ['mon'], start: '08:00', end: '10:00' }] };
    expect(isActive(every, at('2026-01-12T17:00:00Z'))).toBe(true);
  });

  it('nextChange skips weeks that do not match', () => {
    // After Jan 5 week-1 end (10:00 PST = 18:00Z), next is Jan 19 08:00 PST.
    expect(nextChange(firstThird, at('2026-01-05T18:00:00Z'))).toEqual(at('2026-01-19T16:00:00Z'));
  });

  it('a crossing window takes its week from the day it starts', () => {
    // Sat 22:00 to Sun 06:00, week 1 only.
    const s: Schedule = {
      windows: [{ days: ['sat'], start: '22:00', end: '06:00', weeks_of_month: [1] }],
    };
    expect(isActive(s, at('2026-01-04T11:00:00Z'))).toBe(true); // Sun Jan 4 03:00, began Sat Jan 3 (week 1)
    // Sat Jan 31 is week 5, so Sun Feb 1 03:00 (Feb week 1) is not covered.
    expect(isActive(s, at('2026-02-01T11:00:00Z'))).toBe(false);
    expect(isActive(s, at('2026-02-01T07:00:00Z'))).toBe(false); // Sat Jan 31 23:00
  });

  describe('a 5th-week window in a month with no 5th week', () => {
    const fifth: Schedule = {
      windows: [{ days: ['mon'], start: '09:00', end: '17:00', weeks_of_month: [5] }],
    };

    it('is never active in February 2026 (28 days)', () => {
      for (const day of [2, 9, 16, 23]) {
        const d = at(`2026-02-${String(day).padStart(2, '0')}T20:00:00Z`);
        expect(isActive(fifth, d)).toBe(false);
      }
    });

    it('does not fall back to the 4th week', () => {
      expect(isActive(fifth, at('2026-02-23T20:00:00Z'))).toBe(false);
    });

    it('is active on the real 5th Monday (Mar 30, 2026)', () => {
      expect(isActive(fifth, at('2026-03-30T20:00:00Z'))).toBe(true);
    });

    it('nextChange jumps over the missing month to the next 5th Monday', () => {
      // Mar 30 09:00 PDT = 16:00Z
      expect(nextChange(fifth, at('2026-02-01T12:00:00Z'))).toEqual(at('2026-03-30T16:00:00Z'));
    });
  });
});

describe('daylight saving time', () => {
  // Sat 22:00 to Sun 06:00
  const s: Schedule = { windows: [{ days: ['sat'], start: '22:00', end: '06:00' }] };

  it('spring forward (Mar 8, 2026): the night is one hour shorter', () => {
    expect(isActive(s, at('2026-03-08T07:00:00Z'))).toBe(true); // Sat 23:00 PST
    expect(isActive(s, at('2026-03-08T12:59:00Z'))).toBe(true); // Sun 05:59 PDT
    expect(isActive(s, at('2026-03-08T13:00:00Z'))).toBe(false); // Sun 06:00 PDT
    expect(nextChange(s, at('2026-03-08T07:00:00Z'))).toEqual(at('2026-03-08T13:00:00Z'));
  });

  it('fall back (Nov 1, 2026): the night is one hour longer', () => {
    expect(isActive(s, at('2026-11-01T06:00:00Z'))).toBe(true); // Sat 23:00 PDT
    expect(isActive(s, at('2026-11-01T13:59:00Z'))).toBe(true); // Sun 05:59 PST
    expect(isActive(s, at('2026-11-01T14:00:00Z'))).toBe(false); // Sun 06:00 PST
    expect(nextChange(s, at('2026-11-01T06:00:00Z'))).toEqual(at('2026-11-01T14:00:00Z'));
  });

  it('start time before the change uses PST, after it uses PDT', () => {
    const mon: Schedule = { windows: [{ days: ['mon'], start: '09:00', end: '10:00' }] };
    // Mon Mar 2 (PST): 09:00 = 17:00Z. Mon Mar 9 (PDT): 09:00 = 16:00Z.
    expect(nextChange(mon, at('2026-03-02T00:00:00Z'))).toEqual(at('2026-03-02T17:00:00Z'));
    expect(nextChange(mon, at('2026-03-03T00:00:00Z'))).toEqual(at('2026-03-09T16:00:00Z'));
  });

  it('a window covering the repeated hour stays active through both 1 AMs', () => {
    const early: Schedule = { windows: [{ days: ['sun'], start: '01:00', end: '02:00' }] };
    expect(isActive(early, at('2026-11-01T08:30:00Z'))).toBe(true); // 01:30 PDT
    expect(isActive(early, at('2026-11-01T09:30:00Z'))).toBe(true); // 01:30 PST
    expect(isActive(early, at('2026-11-01T10:00:00Z'))).toBe(false); // 02:00 PST
    expect(nextChange(early, at('2026-11-01T08:30:00Z'))).toEqual(at('2026-11-01T10:00:00Z'));
  });
});
