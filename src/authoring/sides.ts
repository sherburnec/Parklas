// Side markers for the authoring page (task M2-7). Pure, so the test can compare them with the build script.
import { sideToOffset, type Offset, type Side } from '../../scripts/lib/side-offset';

export interface SideMarker {
  side: Side;
  /** From the same function the build script uses, so the page cannot disagree with it. */
  offset: Offset;
  /** MapLibre's line-offset sign: -1 draws left of the line's direction, +1 right. */
  sgn: -1 | 1;
}

/** Both sides, relative to a segment's direction (first to last coordinate), so a reversed segment lands them on opposite compass sides. */
export function authoringSides(): SideMarker[] {
  return (['L', 'R'] as const).map((side) => {
    const offset = sideToOffset(side);
    return { side, offset, sgn: offset === 'right' ? 1 : -1 };
  });
}
