import { describe, expect, it } from 'vitest';
import type { CurbColorsConfig, Schedule, SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import { CURB_COLOR_BAND, UNKNOWN_COLOR_HEX, curbColorLegend, curbColorStyle } from './curb-colors';
import { RESTRICTIONS_BAND } from './restrictions';
import type { TimeSelection } from './sweeping';
import { NO_STOPPING_BAND } from './no-stopping';

const TZ = 'America/Los_Angeles';
const weekdays8to18: Schedule = { windows: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '08:00', end: '18:00' }] };
const sat10to12: Schedule = { windows: [{ days: ['sat'], start: '10:00', end: '12:00' }] };

const config: CurbColorsConfig = {
  city_id: 'test',
  colors: {
    red: { label: 'Red: no stopping', hex: '#111111', time_limit_minutes: null, default_schedule: null },
    green: { label: 'Green: short-term', hex: '#222222', time_limit_minutes: 15, default_schedule: weekdays8to18 },
    teal: { label: 'Teal: made-up color', hex: '#333333', time_limit_minutes: 90, default_schedule: null },
  },
};

const row = (color_key: string, schedule: Schedule = null) => ({
  type: 'Feature' as const,
  properties: { segment_id: 's', city_id: 'test', side: 'R' as const, offset: 'right' as const, color_key, schedule },
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 0]] },
});
const collection = (...features: ReturnType<typeof row>[]): SideCollection => ({ type: 'FeatureCollection', features });
const mon8: TimeSelection = { day: 'mon', hour: 8 };
const styled = (rows: ReturnType<typeof row>[], at = mon8, cfg = config) =>
  curbColorStyle(collection(...rows), cfg, at, TZ).features.map((f) => f.properties);

describe('curb color band', () => {
  it('has its own slot, outside every other layer', () => {
    expect(CURB_COLOR_BAND).toBe(bandSlot('curb_color'));
    expect(CURB_COLOR_BAND).toBeGreaterThan(NO_STOPPING_BAND);
    expect(CURB_COLOR_BAND).toBeGreaterThan(RESTRICTIONS_BAND);
  });
});

describe('curbColorStyle', () => {
  it('takes hex, label and time limit from the config', () => {
    const [p] = styled([row('green')]);
    expect(p.hex).toBe('#222222');
    expect(p.label).toBe('Green: short-term, 15 minute limit');
    expect(p.sgn).toBe(1);
  });

  it('works for any color added to the config, with no code change', () => {
    const [p] = styled([row('teal')]);
    expect(p.hex).toBe('#333333');
    expect(p.label).toBe('Teal: made-up color, 90 minute limit');
    const extended = { ...config, colors: { ...config.colors, mauve: { label: 'Mauve', hex: '#abcdef', time_limit_minutes: null, default_schedule: null } } };
    const [m] = styled([row('mauve')], mon8, extended);
    expect(m.hex).toBe('#abcdef');
    expect(m.label).toBe('Mauve');
  });

  it('uses the default schedule when the row has none', () => {
    expect(styled([row('green')], { day: 'mon', hour: 9 })[0].active).toBe(true);
    expect(styled([row('green')], { day: 'mon', hour: 20 })[0].active).toBe(false);
    expect(styled([row('green')], { day: 'sat', hour: 9 })[0].active).toBe(false);
  });

  it("lets a row's own schedule override the default", () => {
    const [weekday] = styled([row('green', sat10to12)], { day: 'mon', hour: 9 });
    const [saturday] = styled([row('green', sat10to12)], { day: 'sat', hour: 10 });
    expect(weekday.active).toBe(false);
    expect(saturday.active).toBe(true);
    expect(weekday.schedule).toEqual(sat10to12);
  });

  it('treats a color with no default and no row schedule as always in force', () => {
    expect(styled([row('red')], { day: 'sun', hour: 3 })[0].active).toBe(true);
  });

  it('puts the effective schedule on the side for the click-through list', () => {
    expect(styled([row('green')])[0].schedule).toEqual(weekdays8to18);
    expect(styled([row('red')])[0].schedule).toBeNull();
  });

  it('draws a key missing from the config in a neutral color instead of dropping it', () => {
    const [p] = styled([row('purple')]);
    expect(p.hex).toBe(UNKNOWN_COLOR_HEX);
    expect(p.label).toBe('Curb color purple');
    expect(p.active).toBe(true);
  });
});

describe('curbColorLegend', () => {
  it('lists every color in the config in order, with its label and hex', () => {
    expect(curbColorLegend(config)).toEqual([
      { label: 'Red: no stopping', hex: '#111111' },
      { label: 'Green: short-term', hex: '#222222' },
      { label: 'Teal: made-up color', hex: '#333333' },
    ]);
  });
});
