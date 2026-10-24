// Street sweeping layer (task M3-4): side bands, active sides highlighted, inactive muted.
import type { SideCollection } from '../data-loader';
import { instantFor, isActive } from '../schedule-engine';
import type { Weekday } from '../schedule-engine';

/** The chosen day and hour. Hourly steps, so the hour is a whole number 0 to 23. */
export interface TimeSelection {
  day: Weekday;
  hour: number;
}

// Band geometry from docs/spike-notes.md. Values are pixels at z17; bands scale 2x per zoom
// between z15 and z19 so they stay a fixed distance from the street in metres.
const FIRST_OFFSET_PX = 2;
const OFFSET_STEP_PX = 2;
const WIDTH_PX = 1;
const MIN_WIDTH_PX = 2;

/** Distance of band `index` (0 is the band nearest the centerline) from the centerline at z17. */
export function bandOffsetPx(index: number): number {
  return FIRST_OFFSET_PX + OFFSET_STEP_PX * index;
}

/** Drawn width at z17: the minimum overrides the nominal width. */
export function bandWidthPx(): number {
  return Math.max(MIN_WIDTH_PX, WIDTH_PX);
}

/** Sweeping is the first rule layer, so it takes the band nearest the street. */
export const SWEEPING_BAND = 0;

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
