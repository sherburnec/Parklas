// Street sweeping layer (task M3-4): side bands, active sides highlighted, inactive muted.
import type { SideCollection } from '../data-loader';
import { instantFor, isActive } from '../schedule-engine';
import type { Weekday } from '../schedule-engine';
import { bandSlot } from './bands';

/** The chosen day and hour. Hourly steps, so the hour is a whole number 0 to 23. */
export interface TimeSelection {
  day: Weekday;
  hour: number;
}

/** Sweeping is the first rule layer, so it takes the band nearest the street. */
export const SWEEPING_BAND = bandSlot('sweeping');

/**
 * Adds `active` (is the rule in force at this day and hour) and `sgn` (+1 draws right of the
 * line's direction, -1 left, as MapLibre's line-offset expects) to each side.
 */
export function sweepingStyle(sweeping: SideCollection, at: TimeSelection, timeZone: string): SideCollection {
  const instant = instantFor(at.day, at.hour, timeZone);
  return {
    ...sweeping,
    features: sweeping.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        active: isActive(f.properties.schedule as Parameters<typeof isActive>[0], instant, timeZone),
        sgn: f.properties.offset === 'right' ? 1 : -1,
      },
    })),
  };
}
