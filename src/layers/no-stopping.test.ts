import { describe, expect, it } from 'vitest';
import type { Schedule, SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import {
  NO_STANDING_DASH, NO_STOPPING_BAND, NO_STOPPING_HEX, noStoppingLegend, noStoppingStyle,
} from './no-stopping';
import { ANY_TIME_HEX, PERMIT_REQUIRED_HEX, RESTRICTIONS_BAND, SPECIFIC_TIMES_HEX, restrictionRows } from './restrictions';
import { SWEEPING_BAND } from './sweeping';
import { PERMIT_EXEMPT_HEX, TIMED_PARKING_BAND } from './timed-parking';

const TZ = 'America/Los_Angeles';
const weekdays8to10: Schedule = { windows: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '08:00', end: '10:00' }] };

const row = (type: string, schedule: Schedule = null, permit: string | null = null) => ({
  type: 'Feature' as const,
  properties: {
    segment_id: 's', city_id: 'test', side: 'L' as const, offset: 'left' as const, type, schedule, permit_code: permit, permit_mode: null,
  },
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 0]] },
});
const collection = (...features: ReturnType<typeof row>[]): SideCollection => ({ type: 'FeatureCollection', features });
const at = { day: 'mon' as const, hour: 8 };
const styled = (...rows: ReturnType<typeof row>[]) => noStoppingStyle(collection(...rows), at, TZ).features.map((f) => f.properties);

describe('restrictionRows', () => {
  it('keeps only the named types and leaves the input alone', () => {
    const input = collection(row('no_parking'), row('no_stopping'), row('no_standing'));
    expect(restrictionRows(input, ['no_stopping', 'no_standing']).features.map((f) => f.properties.type)).toEqual(['no_stopping', 'no_standing']);
    expect(input.features).toHaveLength(3);
  });
});

describe('noStoppingStyle', () => {
  it('draws no stopping and no standing rows only', () => {
    expect(styled(row('no_parking'), row('no_stopping'), row('no_standing')).map((p) => p.type)).toEqual(['no_stopping', 'no_standing']);
  });

  it('tells the two types apart by dash, not color', () => {
    const [stopping, standing] = styled(row('no_stopping'), row('no_standing'));
    expect(stopping.dashed).toBe(false);
    expect(standing.dashed).toBe(true);
    expect(stopping.hex).toBe(standing.hex);
    expect(stopping.hex).toBe(NO_STOPPING_HEX);
    expect(NO_STANDING_DASH.length).toBe(2);
  });

  it('marks a row active only inside its schedule; a null schedule is always active', () => {
    const out = styled(row('no_stopping'), row('no_stopping', weekdays8to10), row('no_standing', weekdays8to10));
    expect(out.map((p) => p.active)).toEqual([true, true, true]);
    const later = noStoppingStyle(collection(row('no_stopping', weekdays8to10)), { day: 'sat', hour: 8 }, TZ);
    expect(later.features[0].properties.active).toBe(false);
  });

  it('ignores a permit code: no permit text, no change of style', () => {
    const [p] = styled(row('no_stopping', null, 'A'));
    expect(p.hex).toBe(NO_STOPPING_HEX);
    expect(p).not.toHaveProperty('permit_label');
  });

  it('words each row for the click-through list', () => {
    const [a, b] = styled(row('no_stopping'), row('no_standing', weekdays8to10));
    expect(a.label).toBe('No stopping, standing or parking at any time');
    expect(b.label).toBe('No standing or parking at specific times');
  });
});

describe('placement and contrast', () => {
  it('takes the fourth band, clear of the other three', () => {
    expect(NO_STOPPING_BAND).toBe(bandSlot('no_stopping'));
    expect(new Set([SWEEPING_BAND, TIMED_PARKING_BAND, RESTRICTIONS_BAND, NO_STOPPING_BAND]).size).toBe(4);
  });

  it('uses a color none of the other layers use', () => {
    const used = [PERMIT_REQUIRED_HEX, SPECIFIC_TIMES_HEX, ANY_TIME_HEX, PERMIT_EXEMPT_HEX, '#d95f02', '#1f78b4', '#33a02c', '#6a3d9a', '#b15928', '#cc79a7'];
    expect(used).not.toContain(NO_STOPPING_HEX);
  });

  it('has the darkest color on the map (relative luminance under 0.02)', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(NO_STOPPING_HEX.slice(i, i + 2), 16) / 255);
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeLessThan(0.02);
  });

  it('has a legend entry for each type', () => {
    expect(noStoppingLegend().map((e) => e.label)).toEqual([
      'No stopping, standing or parking', 'No standing or parking',
    ]);
  });
});
