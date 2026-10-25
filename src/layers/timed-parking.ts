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

/** Any row with a permit_code, whatever its limit. Kept clear of the limit colors and sweeping's orange. */
export const PERMIT_EXEMPT_HEX = '#d4a017';

const hasPermit = (code: unknown): code is string => typeof code === 'string' && code !== '';

const limitText =(minutes: number): string =>
  minutes % 60 === 0 ? `${minutes / 60} hour limit` : `${minutes} minute limit`;

const permitText = (code: string): string => `Zone ${code} permit exempt`;

/** Band label: the limit, plus "Zone X permit exempt" when the row has a permit_code. */
function bandLabel(limit: unknown, permit: unknown): string {
  const base = typeof limit === 'number' ? limitText(limit) : 'Timed parking';
  return hasPermit(permit) ?`${base}, ${permitText(permit)}` : base;
}

/**
 * Adds `active`, `sgn` (as for sweeping), `hex` (the limit's color) and `label` to each side. A null
 * schedule is always active. The day and hour are read the same way as the sweeping layer.
 */
export function timedParkingStyle(parking: SideCollection, at: TimeSelection, timeZone: string): SideCollection {
  const styled = sweepingStyle(parking, at, timeZone);
  return {
    ...styled,
    features: styled.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        hex: hasPermit(f.properties.permit_code)
          ? PERMIT_EXEMPT_HEX
          : (LIMIT_HEX[f.properties.limit_minutes as number] ?? FALLBACK_LIMIT_HEX),
        label: bandLabel(f.properties.limit_minutes, f.properties.permit_code),
      },
    })),
  };
}

export interface TimedParkingLegendEntry {
  label: string;
  hex: string;
}

/** One entry per limit style, then one "Zone X permit exempt" entry per permit code found in `parking`. */
export function timedParkingLegend(parking: SideCollection): TimedParkingLegendEntry[] {
  const limits = Object.keys(LIMIT_HEX)
    .map(Number)
    .sort((a, b) => a - b)
    .map((m) => ({ label: limitText(m), hex: LIMIT_HEX[m] }));
  const codes = new Set<string>();
  for (const f of parking.features) {
    const code = f.properties.permit_code;
    if (hasPermit(code)) codes.add(code);
  }
  return [
    ...limits,
    { label: 'Other limit', hex: FALLBACK_LIMIT_HEX },
    ...[...codes].sort().map((c) => ({ label: permitText(c), hex: PERMIT_EXEMPT_HEX })),
  ];
}
