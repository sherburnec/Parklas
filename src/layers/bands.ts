// Shared band helper (task M3-10). Every rule layer calls this and does no geometry of its own: it cuts each
// band by the trim flags, leaves out inner-facing sides, and draws a sliver only if it has a rule row.
// Hiding is a drawing choice only: the source rows are never changed, and what was left out comes back as data.
import type { SegmentTrim, SideCollection, TrimData } from '../data-loader';
import bandGeometry from '../../config/band-geometry.json';

// Pixel values are at z17 and scale 2x per zoom between z15 and z19 (docs/spike-notes.md). The same
// config file feeds the build script, which derives trim.json from it.

/** Distance of band `index` (0 is the band nearest the centerline) from the centerline at z17. */
export function bandOffsetPx(index: number): number {
  return bandGeometry.first_offset_px + bandGeometry.offset_step_px * index;
}

/** Drawn width at z17: the minimum overrides the nominal width. */
export function bandWidthPx(): number {
  return Math.max(bandGeometry.min_width_px, bandGeometry.width_px);
}

type SideFeature = SideCollection['features'][number];

/** A side or block that was left off the map. Rows stay in the source collection for the click-through list. */
export interface HiddenBand {
  segment_id: string;
  /** inner: another block lies close beside this side. sliver-no-rule: a block under the sliver length with no row in this layer. */
  reason: 'inner' | 'sliver-no-rule';
  /** The side itself, for an inner side. A sliver with no row has none. */
  feature?: SideFeature;
}

export interface BandLayout {
  /** Sides to draw, with geometry cut to the trimmed length. */
  drawn: SideCollection;
  hidden: HiddenBand[];
}

const M_PER_DEG_LAT = 111_320;
const DEG = Math.PI / 180;

type Coord = number[];

function metresBetween(a: Coord, b: Coord): number {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * DEG);
  return Math.hypot((b[0] - a[0]) * mPerDegLon, (b[1] - a[1]) * M_PER_DEG_LAT);
}

/** The part of `coords` between `fromM` and `toM` along it, measured in metres from the first coordinate. */
function cutLine(coords: Coord[], fromM: number, toM: number): Coord[] {
  const out: Coord[] = [];
  const point = (a: Coord, b: Coord, f: number): Coord => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  let at = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const span = metresBetween(a, b);
    const start = at;
    const end = at + span;
    at = end;
    if (span === 0 || end <= fromM || start >= toM) continue;
    if (out.length === 0) out.push(start >= fromM ? a : point(a, b, (fromM - start) / span));
    out.push(end <= toM ? b : point(a, b, (toM - start) / span));
  }
  return out;
}

const lengthOf = (coords: Coord[]) => coords.slice(1).reduce((sum, c, i) => sum + metresBetween(coords[i], c), 0);

/**
 * Decides what to draw for one layer. `sides` are that layer's rule rows (one side per row); a segment with
 * no entry in `trim` is drawn uncut. Slivers that have no row in this layer are reported so a later
 * layer or list can still tell they were skipped.
 */
export function layoutBands(sides: SideCollection, trim: TrimData): BandLayout {
  const drawn: SideFeature[] = [];
  const hidden: HiddenBand[] = [];
  const withRows = new Set<string>();

  for (const f of sides.features) {
    const id = f.properties.segment_id;
    withRows.add(id);
    const t: SegmentTrim | undefined = trim.segments[id];
    if (!t) {
      drawn.push(f);
      continue;
    }
    if (t[`inner_${f.properties.side}`]) {
      hidden.push({ segment_id: id, reason: 'inner', feature: f });
      continue;
    }
    const coords = f.geometry.coordinates;
    const total = lengthOf(coords);
    const cut = t.trim_start_m > 0 || t.trim_end_m > 0 ? cutLine(coords, t.trim_start_m, total - t.trim_end_m) : coords;
    if (cut.length < 2) continue;
    drawn.push(cut === coords ? f : { ...f, geometry: { ...f.geometry, coordinates: cut } });
  }

  for (const [id, t] of Object.entries(trim.segments)) {
    if (t.sliver && !withRows.has(id)) hidden.push({ segment_id: id, reason: 'sliver-no-rule' });
  }

  return { drawn: { ...sides, features: drawn }, hidden };
}
