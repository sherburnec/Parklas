// Street sweeping layer (task M3-4): side bands, active sides highlighted, inactive muted.
import type { SideCollection } from '../data-loader';
import { instantFor, isActive, isActiveOnDay } from '../schedule-engine';
import type { Schedule, TimeMode, Weekday } from '../schedule-engine';
import { bandSlot } from './bands';

/** The chosen day and hour. Hourly steps, so the hour is a whole number 0 to 23. */
export interface TimeSelection {
  day: Weekday;
  hour: number;
  /** How a rule is read against the day and hour (M5-8). Absent means 'hour'. */
  mode?: TimeMode;
  /** Zone filter (M4-5): 'all' or absent, 'none', or a permit code. Layers draw only the sides it allows. */
  zone?: string;
}

/** Sweeping is the first rule layer, so it takes the band nearest the street. */
export const SWEEPING_BAND = bandSlot('sweeping');

/**
 * Is a rule active under this selection? Every layer decides `active` here. 'hour' (or no mode): in force at the
 * chosen hour. 'day': in force at any minute of the chosen day. 'all': always, whatever the schedule. The zone
 * filter is not part of this; it limits which sides a layer draws in every mode.
 */
export function isScheduleActive(schedule: Schedule, at: TimeSelection, timeZone: string): boolean {
  switch (at.mode ?? 'hour') {
    case 'all':
      return true;
    case 'day':
      return isActiveOnDay(schedule, instantFor(at.day, 0, timeZone), timeZone);
    default:
      return isActive(schedule, instantFor(at.day, at.hour, timeZone), timeZone);
  }
}

/**
 * Adds `active` (is the rule in force under the selection, see isScheduleActive) and `sgn` (+1 draws right of the
 * line's direction, -1 left, as MapLibre's line-offset expects) to each side.
 */
export function sweepingStyle(sweeping: SideCollection, at: TimeSelection, timeZone: string): SideCollection {
  return {
    ...sweeping,
    features: sweeping.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        active: isScheduleActive(f.properties.schedule as Schedule, at, timeZone),
        sgn: f.properties.offset === 'right' ? 1 : -1,
      },
    })),
  };
}
