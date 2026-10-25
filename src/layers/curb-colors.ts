// Curb colors layer (task M3-8): painted curbs as side bands. Label, hex, time limit and default schedule all come
// from the city's curb color config, so a new color needs a config entry and nothing else.
import type { CurbColorsConfig, SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import { sweepingStyle } from './sweeping';
import type { TimeSelection } from './sweeping';

/** Curb colors take their own slot, the outermost band, from the shared band config. */
export const CURB_COLOR_BAND = bandSlot('curb_color');

/** A row whose `color_key` is not in the config (the validator rejects these). Neutral, so it reads as a mistake. */
export const UNKNOWN_COLOR_HEX = '#757575';

type ColorEntry = CurbColorsConfig['colors'][string];

const limitText = (minutes: number): string => `${minutes} minute limit`;

function bandLabel(key: string, entry: ColorEntry | undefined): string {
  if (!entry) return `Curb color ${key}`;
  return entry.time_limit_minutes === null ? entry.label : `${entry.label}, ${limitText(entry.time_limit_minutes)}`;
}

/**
 * Adds `active`, `sgn` (as for sweeping), `hex` and `label` to each side. The schedule is the row's own when it has
 * one, else the color's default; the result is written back to `schedule` so the click-through list shows what the
 * map used. A null schedule on both means always in force.
 */
export function curbColorStyle(
  curbColors: SideCollection,
  config: CurbColorsConfig,
  at: TimeSelection,
  timeZone: string,
): SideCollection {
  const withSchedule: SideCollection = {
    ...curbColors,
    features: curbColors.features.map((f) => {
      const key = f.properties.color_key as string;
      const own = f.properties.schedule ?? null;
      const entry = config.colors[key];
      return { ...f, properties: { ...f.properties, schedule: own ?? entry?.default_schedule ?? null } };
    }),
  };
  const styled = sweepingStyle(withSchedule, at, timeZone);
  return {
    ...styled,
    features: styled.features.map((f) => {
      const key = f.properties.color_key as string;
      const entry = config.colors[key];
      return { ...f, properties: { ...f.properties, hex: entry?.hex ?? UNKNOWN_COLOR_HEX, label: bandLabel(key, entry) } };
    }),
  };
}

export interface CurbColorLegendEntry {
  label: string;
  hex: string;
}

/** One entry per color in the config, in config order. */
export function curbColorLegend(config: CurbColorsConfig): CurbColorLegendEntry[] {
  return Object.values(config.colors).map(({ label, hex }) => ({ label, hex }));
}
