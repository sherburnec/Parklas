// Restrictions layer (task M3-6): no parking rows as side bands, in three styles. No stopping and no standing
// rows are not drawn here; they have their own layer (M3-7).
import type { SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import { sweepingStyle } from './sweeping';
import type { TimeSelection } from './sweeping';

/** Restrictions is the third rule layer, so it sits one step out from timed parking. */
export const RESTRICTIONS_BAND = bandSlot('restrictions');

/** No parking except by permit. Kept clear of the limit colors and sweeping's orange. */
export const PERMIT_REQUIRED_HEX = '#00838f';

/** No parking at specific times. */
export const SPECIFIC_TIMES_HEX = '#e53935';

/** No parking at any time. */
export const ANY_TIME_HEX = '#880e4f';

export type RestrictionKind = 'permit_required' | 'specific_times' | 'any_time';

const KIND_HEX: Record<RestrictionKind, string> = {
  permit_required: PERMIT_REQUIRED_HEX,
  specific_times: SPECIFIC_TIMES_HEX,
  any_time: ANY_TIME_HEX,
};

const KIND_TEXT: Record<RestrictionKind, string> = {
  permit_required: 'No parking except by permit',
  specific_times: 'No parking at specific times',
  any_time: 'No parking at any time',
};

/** The rows of `restrictions` whose `type` is one of `types`. Each restrictions layer draws its own types only. */
export function restrictionRows(restrictions: SideCollection, types: readonly string[]): SideCollection {
  return { ...restrictions, features: restrictions.features.filter((f) => types.includes(f.properties.type as string)) };
}

const hasPermit = (code: unknown): code is string => typeof code === 'string' && code !== '';

/** "Except by permit" needs a code to name the zone; a `required` row without one falls back to its schedule. */
function kindOf(permitCode: unknown, permitMode: unknown, schedule: unknown): RestrictionKind {
  if (permitMode === 'required' && hasPermit(permitCode)) return 'permit_required';
  return schedule === null || schedule === undefined ? 'any_time' : 'specific_times';
}

const permitText = (code: string, kind: RestrictionKind): string =>
  `Zone ${code} permit ${kind === 'permit_required' ? 'required' : 'exempt'}`;

/**
 * Keeps the no parking rows and adds `active`, `sgn` (as for sweeping), `kind`, `hex`, `permit_label` (the
 * "Zone X permit required" or "Zone X permit exempt" text, or null) and `label` to each side. A null schedule
 * is always active.
 */
export function restrictionsStyle(restrictions: SideCollection, at: TimeSelection, timeZone: string): SideCollection {
  const styled = sweepingStyle(restrictionRows(restrictions, ['no_parking']), at, timeZone);
  return {
    ...styled,
    features: styled.features.map((f) => {
      const { permit_code: code, permit_mode: mode, schedule } = f.properties;
      const kind = kindOf(code, mode, schedule);
      const permitLabel = hasPermit(code) ? permitText(code, kind) : null;
      const base = KIND_TEXT[kind];
      return {
        ...f,
        properties: {
          ...f.properties,
          kind,
          hex: KIND_HEX[kind],
          permit_label: permitLabel,
          label: permitLabel === null ? base : `${base}, ${permitLabel}`,
        },
      };
    }),
  };
}

export interface RestrictionsLegendEntry {
  label: string;
  hex: string;
}

/** One entry per style. Permit codes are labelled on the bands themselves. */
export function restrictionsLegend(): RestrictionsLegendEntry[] {
  return (Object.keys(KIND_TEXT) as RestrictionKind[]).map((k) => ({ label: KIND_TEXT[k], hex: KIND_HEX[k] }));
}
