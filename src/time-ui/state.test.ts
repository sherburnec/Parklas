import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, LAYER_KEYS, createAppState, parseSearch, toSearch } from './state';

describe('parseSearch', () => {
  it('falls back to the defaults for an empty query', () => {
    expect(parseSearch('')).toEqual(DEFAULT_STATE);
  });

  it('reads day, hour and hidden layers', () => {
    const s = parseSearch('?day=fri&hour=17&hide=zoning,sweeping');
    expect(s.day).toBe('fri');
    expect(s.hour).toBe(17);
    expect(s.visible.zoning).toBe(false);
    expect(s.visible.sweeping).toBe(false);
    expect(s.visible.timed_parking).toBe(true);
  });

  it('ignores bad values instead of failing', () => {
    const s = parseSearch('?day=funday&hour=25&hide=nope,zoning');
    expect(s.day).toBe(DEFAULT_STATE.day);
    expect(s.hour).toBe(DEFAULT_STATE.hour);
    expect(s.visible.zoning).toBe(false);
    expect(parseSearch('?hour=7.5').hour).toBe(DEFAULT_STATE.hour);
    expect(parseSearch('?hour=').hour).toBe(DEFAULT_STATE.hour);
  });
});

describe('zone filter in the URL', () => {
  it('defaults to all and reads a code or none', () => {
    expect(parseSearch('').zone).toBe('all');
    expect(parseSearch('?zone=DEMO-C').zone).toBe('DEMO-C');
    expect(parseSearch('?zone=none').zone).toBe('none');
    expect(parseSearch('?zone=').zone).toBe('all');
  });

  it('round-trips a chosen zone, and leaves zone out when it is all', () => {
    const base = createAppState().get();
    for (const zone of ['C', 'none']) {
      expect(parseSearch(toSearch({ ...base, zone }, '')).zone).toBe(zone);
    }
    expect(new URLSearchParams(toSearch(base, '?zone=C')).has('zone')).toBe(false);
  });

  it('is changed through set, notifies once, and ignores a repeat', () => {
    const state = createAppState('');
    const fn = vi.fn();
    state.subscribe(fn);
    state.set({ zone: 'B' });
    state.set({ zone: 'B' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(state.get().zone).toBe('B');
    expect(() => state.set({ zone: '' })).toThrow();
  });
});

describe('toSearch', () => {
  it('round-trips every state', () => {
    const state = createAppState().get();
    const changed = { ...state, day: 'sun' as const, hour: 0, visible: { ...state.visible, curb_colors: false, permit_zones: false } };
    expect(parseSearch(toSearch(changed, ''))).toEqual(changed);
  });

  it('omits hide when every layer is on, and keeps unrelated parameters', () => {
    const search = toSearch(DEFAULT_STATE, '?foo=bar&hide=zoning&day=tue');
    const params = new URLSearchParams(search);
    expect(params.get('foo')).toBe('bar');
    expect(params.has('hide')).toBe(false);
    expect(params.get('day')).toBe(DEFAULT_STATE.day);
  });
});

describe('createAppState', () => {
  it('starts from the given search', () => {
    expect(createAppState('?day=wed&hour=3').get()).toMatchObject({ day: 'wed', hour: 3 });
  });

  it('tells every subscriber once per change, and not for a no-op', () => {
    const state = createAppState('');
    const a = vi.fn();
    const b = vi.fn();
    state.subscribe(a);
    state.subscribe(b);
    state.set({ day: 'sat', hour: 22 });
    state.set({ day: 'sat', hour: 22 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0]).toMatchObject({ day: 'sat', hour: 22 });
  });

  it('toggles one layer without touching the others', () => {
    const state = createAppState('');
    state.setLayerVisible('sweeping', false);
    const { visible } = state.get();
    expect(visible.sweeping).toBe(false);
    expect(LAYER_KEYS.filter((k) => k !== 'sweeping').every((k) => visible[k])).toBe(true);
  });

  it('rejects an hour that is not a whole number 0 to 23', () => {
    const state = createAppState('');
    expect(() => state.set({ hour: 24 })).toThrow();
    expect(() => state.set({ hour: 1.5 })).toThrow();
  });

  it('stops notifying after unsubscribe', () => {
    const state = createAppState('');
    const fn = vi.fn();
    const off = state.subscribe(fn);
    off();
    state.set({ hour: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('time mode (task M5-8)', () => {
  it('defaults to hour, and an absent mode means hour', () => {
    expect(DEFAULT_STATE.mode).toBe('hour');
    expect(parseSearch('').mode).toBe('hour');
    expect(parseSearch('?day=tue&hour=3').mode).toBe('hour');
  });

  it('reads mode=day and mode=all', () => {
    expect(parseSearch('?mode=day').mode).toBe('day');
    expect(parseSearch('?mode=all').mode).toBe('all');
  });

  it('falls back to hour for a bad value', () => {
    for (const bad of ['?mode=week', '?mode=', '?mode=DAY', '?mode=hour,day']) expect(parseSearch(bad).mode).toBe('hour');
  });

  it('writes mode only when it is day or all', () => {
    const base = createAppState().get();
    expect(new URLSearchParams(toSearch(base, '')).has('mode')).toBe(false);
    expect(new URLSearchParams(toSearch({ ...base, mode: 'day' }, '')).get('mode')).toBe('day');
    expect(new URLSearchParams(toSearch({ ...base, mode: 'all' }, '')).get('mode')).toBe('all');
    expect(new URLSearchParams(toSearch(base, '?mode=all')).has('mode')).toBe(false);
  });

  it('round-trips through the URL, so the mode survives a reload', () => {
    const base = createAppState().get();
    for (const mode of ['hour', 'day', 'all'] as const) {
      expect(parseSearch(toSearch({ ...base, day: 'sat', hour: 21, mode }, '')).mode).toBe(mode);
    }
  });

  it('is changed through set, notifies once, ignores a repeat, and keeps the day and hour', () => {
    const state = createAppState('?day=wed&hour=14');
    const fn = vi.fn();
    state.subscribe(fn);
    state.set({ mode: 'day' });
    state.set({ mode: 'day' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(state.get()).toMatchObject({ mode: 'day', day: 'wed', hour: 14 });
  });

  it('rejects a mode that is not hour, day or all', () => {
    const state = createAppState('');
    expect(() => state.set({ mode: 'week' as never })).toThrow();
  });
});
