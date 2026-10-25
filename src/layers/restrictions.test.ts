import { describe, expect, it } from 'vitest';
import type { Schedule, SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import {
  ANY_TIME_HEX, PERMIT_REQUIRED_HEX, RESTRICTIONS_BAND, SPECIFIC_TIMES_HEX, restrictionsLegend, restrictionsStyle,
} from './restrictions';
import { SWEEPING_BAND } from './sweeping';
import { TIMED_PARKING_BAND, PERMIT_EXEMPT_HEX } from './timed-parking';

const TZ = 'America/Los_Angeles';
const weekdays8to10: Schedule = { windows: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '08:00', end: '10:00' }] };

interface RowOptions {
  type?: string;
  schedule?: Schedule;
  permit?: string | null;
  mode?: 'required' | 'exempt' | null;
  offset?: 'left' | 'right';
}

const row = ({ type = 'no_parking', schedule = null, permit = null, mode = null, offset = 'left' }: RowOptions = {}) => ({
  type: 'Feature' as const,
  properties: {
    segment_id: 's', city_id: 'test', side: 'L' as const, offset, type, schedule, permit_code: permit, permit_mode: mode,
  },
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 0]] },
});
const collection = (...features: ReturnType<typeof row>[]): SideCollection => ({ type: 'FeatureCollection', features });
const at = { day: 'mon' as const, hour: 8 };
const styled = (...rows: ReturnType<typeof row>[]) => restrictionsStyle(collection(...rows), at, TZ).features.map((f) => f.properties);

describe('restrictionsStyle: which rows', () => {
  it('draws no parking rows only; no stopping and no standing are left to M3-7', () => {
    const out = styled(row(), row({ type: 'no_stopping' }), row({ type: 'no_standing' }), row({ schedule: weekdays8to10 }));
    expect(out.map((p) => p.type)).toEqual(['no_parking', 'no_parking']);
  });

  it('keeps the input unchanged', () => {
    const input = collection(row());
    restrictionsStyle(input, at, TZ);
    expect('kind' in input.features[0].properties).toBe(false);
  });
});

describe('restrictionsStyle: three styles', () => {
  it('sets the kind from permit_mode and schedule', () => {
    const [required, timed, anyTime, exemptTimed, exemptAnyTime] = styled(
      row({ permit: 'A', mode: 'required', schedule: weekdays8to10 }),
      row({ schedule: weekdays8to10 }),
      row({ schedule: null }),
      row({ permit: 'A', mode: 'exempt', schedule: weekdays8to10 }),
      row({ permit: 'A', schedule: null }),
    );
    expect(required.kind).toBe('permit_required');
    expect(timed.kind).toBe('specific_times');
    expect(anyTime.kind).toBe('any_time');
    expect(exemptTimed.kind).toBe('specific_times');
    expect(exemptAnyTime.kind).toBe('any_time');
  });

  it('treats "required" without a code as an ordinary row, by its schedule', () => {
    const [p] = styled(row({ mode: 'required', schedule: weekdays8to10 }));
    expect(p.kind).toBe('specific_times');
  });

  it('gives each kind its own color, apart from the other layers', () => {
    const hexes = styled(row({ permit: 'A', mode: 'required' }), row({ schedule: weekdays8to10 }), row()).map((p) => p.hex);
    expect(hexes).toEqual([PERMIT_REQUIRED_HEX, SPECIFIC_TIMES_HEX, ANY_TIME_HEX]);
    expect(new Set(hexes).size).toBe(3);
    expect(hexes).not.toContain(PERMIT_EXEMPT_HEX);
  });

  it('colors a required row the same whatever its schedule', () => {
    const hexes = styled(row({ permit: 'A', mode: 'required', schedule: null }), row({ permit: 'A', mode: 'required', schedule: weekdays8to10 }));
    expect(hexes.map((p) => p.hex)).toEqual([PERMIT_REQUIRED_HEX, PERMIT_REQUIRED_HEX]);
  });
});

describe('restrictionsStyle: permit label', () => {
  const labelOf = (o: RowOptions) => styled(row(o))[0].permit_label;

  it('says "Zone X permit required" for an except-by-permit row', () => {
    expect(labelOf({ permit: 'A', mode: 'required' })).toBe('Zone A permit required');
  });

  it('says "Zone X permit exempt" for any other row that carries a code', () => {
    expect(labelOf({ permit: 'B', mode: 'exempt', schedule: weekdays8to10 })).toBe('Zone B permit exempt');
    expect(labelOf({ permit: 'B', schedule: weekdays8to10 })).toBe('Zone B permit exempt');
    expect(labelOf({ permit: 'B', schedule: null })).toBe('Zone B permit exempt');
  });

  it('has no permit label where no code is set', () => {
    expect(labelOf({})).toBeNull();
    expect(labelOf({ schedule: weekdays8to10 })).toBeNull();
  });

  it('keeps the full label readable: the kind, then the permit text', () => {
    const [req, timed, plain] = styled(row({ permit: 'A', mode: 'required' }), row({ permit: 'A', schedule: weekdays8to10 }), row());
    expect(req.label).toBe('No parking except by permit, Zone A permit required');
    expect(timed.label).toBe('No parking at specific times, Zone A permit exempt');
    expect(plain.label).toBe('No parking at any time');
  });
});

describe('restrictionsStyle: active', () => {
  it('follows the schedule by hour, and a null schedule is always active', () => {
    const active = (h: number) =>
      restrictionsStyle(collection(row({ schedule: weekdays8to10 })), { day: 'mon', hour: h }, TZ).features[0].properties.active;
    expect([7, 8, 9, 10].map(active)).toEqual([false, true, true, false]);
    expect(styled(row({ schedule: null }))[0].active).toBe(true);
  });

  it('adds the sign as sweeping does', () => {
    expect(styled(row({ offset: 'right' }), row({ offset: 'left' })).map((p) => p.sgn)).toEqual([1, -1]);
  });
});

describe('restrictions legend', () => {
  it('lists the three styles, each in its own color; permit codes are labelled on the map instead', () => {
    const entries = restrictionsLegend();
    expect(entries.map((e) => e.label)).toEqual([
      'No parking except by permit',
      'No parking at specific times',
      'No parking at any time',
    ]);
    expect(entries.map((e) => e.hex)).toEqual([PERMIT_REQUIRED_HEX, SPECIFIC_TIMES_HEX, ANY_TIME_HEX]);
  });
});

describe('restrictions band slot', () => {
  it('has its own slot, apart from sweeping and timed parking, read from the shared config', () => {
    expect(RESTRICTIONS_BAND).toBe(bandSlot('restrictions'));
    expect(new Set([SWEEPING_BAND, TIMED_PARKING_BAND, RESTRICTIONS_BAND]).size).toBe(3);
  });
});
