// Timed parking layer (task M3-5): side bands, one color per limit, active sides strong and inactive muted.
import type { SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import { sweepingStyle } from './sweeping';
import type { TimeSelection } from './sweeping';

/** Timed parking is the second rule layer, so it sits one step out from sweeping. */
export const TIMED_PARKING_BAND = bandSlot('timed_parking');

/** Band color by limit in minutes. Kept clear of sweeping's orange so the two layers read apart side by side. */
export const LIMIT_HEX: Record<number, string> = {
  60: '#1f78b4',
  120: '#33a02c',
  180: '#6a3d9a',
  240: '#b15928',
};

/** Any limit not listed above, including no limit. */
export const FALLBACK_LIMIT_HEX = '#cc79a7';

/**
 * Adds `active`, `sgn` (as for sweeping) and `hex` (the limit's color) to each side. A null schedule is
 * always active. The day and hour are read the same way as the sweeping layer.
 */
export function timedParkingStyle(parking: SideCollection, at: TimeSelection, timeZone: string): SideCollection {
  const styled = sweepingStyle(parking, at, timeZone);
  return {
    ...styled,
    features: styled.features.map((f) => ({
      ...f,
      properties: { ...f.properties, hex: LIMIT_HEX[f.properties.limit_minutes as number] ?? FALLBACK_LIMIT_HEX },
    })),
  };
}
