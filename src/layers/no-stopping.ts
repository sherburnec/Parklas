// No stopping / no standing layer (task M3-7): the strictest restrictions, in the outermost band and the
// highest-contrast style on the map. No stopping is a solid band, no standing a dashed one.
import type { SideCollection } from '../data-loader';
import { bandSlot } from './bands';
import { restrictionRows } from './restrictions';
import { sweepingStyle } from './sweeping';
import type { TimeSelection } from './sweeping';

/** The fourth band, one step out from restrictions. */
export const NO_STOPPING_BAND = bandSlot('no_stopping');

/** Black: darker than every other layer color, and none of them is near it. */
export const NO_STOPPING_HEX = '#000000';

/** `line-dasharray` for no standing, in line widths. It is not data-driven, so each type gets its own map layer. */
export const NO_STANDING_DASH: [number, number] = [2, 1.5];

const TEXT = {
  no_stopping: 'No stopping, standing or parking',
  no_standing: 'No standing or parking',
} as const;

/**
 * Keeps the no stopping and no standing rows and adds `active`, `sgn` (as for sweeping), `dashed`, `hex` and
 * `label` to each side. A null schedule is always active. A `permit_code` on these rows is ignored: a permit
 * does not lift a stopping or standing ban.
 */
export function noStoppingStyle(restrictions: SideCollection, at: TimeSelection, timeZone: string): SideCollection {
  const styled = sweepingStyle(restrictionRows(restrictions, ['no_stopping', 'no_standing']), at, timeZone);
  return {
    ...styled,
    features: styled.features.map((f) => {
      const standing = f.properties.type === 'no_standing';
      const base = TEXT[standing ? 'no_standing' : 'no_stopping'];
      const always = f.properties.schedule === null || f.properties.schedule === undefined;
      return {
        ...f,
        properties: {
          ...f.properties,
          dashed: standing,
          hex: NO_STOPPING_HEX,
          label: `${base} at ${always ? 'any time' : 'specific times'}`,
        },
      };
    }),
  };
}

export interface NoStoppingLegendEntry {
  label: string;
  dashed: boolean;
}

/** One entry per type. */
export function noStoppingLegend(): NoStoppingLegendEntry[] {
  return [
    { label: TEXT.no_stopping, dashed: false },
    { label: TEXT.no_standing, dashed: true },
  ];
}
