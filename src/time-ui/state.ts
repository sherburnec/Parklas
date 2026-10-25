import type { Weekday } from '../schedule-engine';

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** One key per toggle. */
export const LAYER_KEYS = [
  'zoning', 'permit_zones', 'sweeping', 'timed_parking', 'restrictions', 'no_stopping', 'curb_colors',
] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

export const LAYER_LABELS: Record<LayerKey, string> = {
  zoning: 'Zoning',
  permit_zones: 'Permit zones',
  sweeping: 'Street sweeping',
  timed_parking: 'Timed parking',
  restrictions: 'Restrictions',
  no_stopping: 'No stopping / standing',
  curb_colors: 'Curb colors',
};

/** The chosen day and hour (a whole number 0 to 23) and which layers are shown. */
export interface AppState {
  day: Weekday;
  hour: number;
  visible: Record<LayerKey, boolean>;
}

export const DEFAULT_STATE: AppState = {
  day: 'mon',
  hour: 8,
  visible: Object.fromEntries(LAYER_KEYS.map((k) => [k, true])) as Record<LayerKey, boolean>,
};

const isHour = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 23;

/** Reads the state from a URL query string. A missing or bad value falls back to its default. */
export function parseSearch(search: string): AppState {
  const params = new URLSearchParams(search);
  const day = params.get('day');
  const hourText = params.get('hour');
  const hour = hourText !== null && hourText.trim() !== '' ? Number(hourText) : NaN;
  const visible = { ...DEFAULT_STATE.visible };
  for (const key of (params.get('hide') ?? '').split(',')) {
    if ((LAYER_KEYS as readonly string[]).includes(key)) visible[key as LayerKey] = false;
  }
  return {
    day: WEEKDAYS.find((d) => d === day) ?? DEFAULT_STATE.day,
    hour: isHour(hour) ? hour : DEFAULT_STATE.hour,
    visible,
  };
}

/** The query string for a state, keeping any parameters in `search` that are not ours. */
export function toSearch(state: AppState, search: string): string {
  const params = new URLSearchParams(search);
  params.set('day', state.day);
  params.set('hour', String(state.hour));
  const hidden = LAYER_KEYS.filter((k) => !state.visible[k]);
  if (hidden.length > 0) params.set('hide', hidden.join(','));
  else params.delete('hide');
  return `?${params.toString().replace(/%2C/g, ',')}`;
}

export interface StateChange {
  day?: Weekday;
  hour?: number;
}

export interface AppStateStore {
  get(): AppState;
  /** Change the day and/or hour. Throws if the hour is not a whole number 0 to 23. */
  set(change: StateChange): void;
  setLayerVisible(key: LayerKey, visible: boolean): void;
  /** Called with the new state after every real change. Returns an unsubscribe function. */
  subscribe(listener: (state: AppState) => void): () => void;
}

/** The one shared state, in memory. `search` is the starting URL query string. */
export function createAppState(search = ''): AppStateStore {
  let state = parseSearch(search);
  const listeners = new Set<(s: AppState) => void>();
  const commit = (next: AppState): void => {
    state = next;
    for (const listener of [...listeners]) listener(state);
  };
  return {
    get: () => state,
    set(change) {
      const day = change.day ?? state.day;
      const hour = change.hour ?? state.hour;
      if (!isHour(hour)) throw new Error(`hour must be a whole number 0 to 23, not ${hour}`);
      if (!WEEKDAYS.includes(day)) throw new Error(`day must be one of ${WEEKDAYS.join(', ')}, not ${day}`);
      if (day === state.day && hour === state.hour) return;
      commit({ ...state, day, hour });
    },
    setLayerVisible(key, visible) {
      if (state.visible[key] === visible) return;
      commit({ ...state, visible: { ...state.visible, [key]: visible } });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
