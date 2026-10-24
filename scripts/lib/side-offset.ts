// Which way a side is offset. Shared by the build script and the authoring page (task M2-7) so they cannot disagree.
// No imports, so the browser bundle does not pull in the build script's dependencies.
export type Side = 'L' | 'R';
export type Offset = 'left' | 'right';

/**
 * Which way a side is offset. "L" and "R" are left and right when facing along the segment's direction (first to
 * last coordinate in segments.geojson), which is also how MapLibre's line-offset reads: negative is left, positive right.
 * Anything else, compass letters included, is an error, not a guess.
 */
export function sideToOffset(side: Side): Offset {
  if (side === 'L') return 'left';
  if (side === 'R') return 'right';
  throw new Error(`side ${JSON.stringify(side)} must be L or R (left or right facing along the segment's direction)`);
}
