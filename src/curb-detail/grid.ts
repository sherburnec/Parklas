// City-grid label for a side (task M4-3). For display only: nothing here is stored or used to look up a rule,
// because Burbank's grid is not compass-aligned and the data keys sides as L/R (docs/spike-notes.md, decision 1).
import type { Side } from '../data-loader';

/**
 * Compass bearing of city north, in degrees. An approximate, hand-measured value: the downtown grid runs
 * Olive Avenue at about 41 degrees and North San Fernando Boulevard at about 130, with city north toward the
 * northwest end of San Fernando. Other parts of the city sit at other angles, so the label is a guide only.
 */
export const GRID_NORTH_BEARING = 311;

export type GridSide = 'north' | 'east' | 'south' | 'west';

const GRID: GridSide[] = ['north', 'east', 'south', 'west'];

/** Compass bearing facing from the first to the last coordinate (or the first two, for a loop). */
function headingOf(coords: number[][]): number {
  const first = coords[0];
  let last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) last = coords[1] ?? last;
  const dx = (last[0] - first[0]) * Math.cos(((first[1] + last[1]) / 2) * (Math.PI / 180));
  const dy = last[1] - first[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** The city-grid direction the given side of the block faces: L is 90 degrees left of travel, R 90 degrees right. */
export function gridSide(coords: number[][], side: Side): GridSide {
  const facing = headingOf(coords) + (side === 'L' ? -90 : 90);
  const fromNorth = (((facing - GRID_NORTH_BEARING) % 360) + 360) % 360;
  return GRID[Math.round(fromNorth / 90) % 4];
}
