// Pure logic for the data build (task M2-4). No file I/O here: the CLI reads and writes the files.
import { parseCsv } from './validate.ts';
import type { SegmentCollection } from './segments.ts';

export type { SegmentCollection };
import { sideToOffset, type Offset, type Side } from './side-offset.ts';

export { sideToOffset };
export type { Offset, Side };
export type Line = [number, number][];

export interface RuleRow {
  segment_id: string;
  side: Side;
  layer: 'sweeping' | 'timed_parking' | 'restrictions' | 'curb_color';
  type: string | null;
  limit_minutes: number | null;
  permit_code: string | null;
  /** Restrictions only: `required` means no parking except by permit; empty or `exempt` means the code is an exemption. */
  permit_mode?: 'required' | 'exempt' | null;
  color_key: string | null;
  schedule: unknown;
}

export interface SideFeature {
  type: 'Feature';
  properties: Record<string, unknown> & { segment_id: string; city_id: string; side: Side; offset: Offset };
  geometry: { type: 'LineString'; coordinates: Line };
}

export interface SideCollection {
  type: 'FeatureCollection';
  features: SideFeature[];
}

export interface BuiltLayers {
  sweeping: SideCollection;
  timedParking: SideCollection;
  restrictions: SideCollection;
  curbColors: SideCollection;
  coverage: { city_id: string; segment_ids: string[] };
}

const empty = (): SideCollection => ({ type: 'FeatureCollection', features: [] });

export function buildLayers(segments: SegmentCollection, rows: RuleRow[], cityId: string): BuiltLayers {
  const byId = new Map(segments.features.map((f) => [f.properties.segment_id, f]));
  const out: BuiltLayers = {
    sweeping: empty(),
    timedParking: empty(),
    restrictions: empty(),
    curbColors: empty(),
    coverage: { city_id: cityId, segment_ids: [] },
  };
  const covered = new Set<string>();

  rows.forEach((r, i) => {
    const where = `rules.csv row ${i + 2} (${r.segment_id})`;
    const seg = byId.get(r.segment_id);
    if (!seg) throw new Error(`${where}: segment_id is not in segments.geojson`);
    let offset: Offset;
    try {
      offset = sideToOffset(r.side);
    } catch (err) {
      throw new Error(`${where}: ${(err as Error).message}`, { cause: err });
    }
    const base = {
      segment_id: r.segment_id,
      city_id: cityId,
      street: seg.properties.street,
      from_street: seg.properties.from_street,
      to_street: seg.properties.to_street,
      side: r.side,
      offset,
    };
    const geometry = { type: 'LineString' as const, coordinates: seg.geometry.coordinates };
    const feature = (extra: Record<string, unknown>): SideFeature => ({
      type: 'Feature',
      properties: { ...base, ...extra, schedule: r.schedule },
      geometry,
    });
    switch (r.layer) {
      case 'sweeping':
        out.sweeping.features.push(feature({}));
        break;
      case 'timed_parking':
        out.timedParking.features.push(feature({ limit_minutes: r.limit_minutes, permit_code: r.permit_code }));
        break;
      case 'restrictions':
        out.restrictions.features.push(feature({ type: r.type, permit_code: r.permit_code, permit_mode: r.permit_mode ?? null }));
        break;
      case 'curb_color':
        out.curbColors.features.push(feature({ color_key: r.color_key }));
        break;
    }
    covered.add(r.segment_id);
  });

  out.coverage.segment_ids = [...covered].sort();
  return out;
}

/**
 * Parse rules.csv into rows. Call only on text that already passed the validator, which checks
 * the header, the cell count and every value; this just converts cells to their types.
 */
export function parseRuleRows(csv: string): RuleRow[] {
  const [header, ...body] = parseCsv(csv);
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return body
    .filter((cells) => !(cells.length === 1 && cells[0].trim() === ''))
    .map((cells) => {
      const rec: Record<string, unknown> = {};
      names.forEach((h, c) => {
        const v = cells[c].trim();
        rec[h] = v === '' ? null : h === 'limit_minutes' ? Number(v) : h === 'schedule' ? JSON.parse(v) : v;
      });
      return {
        segment_id: rec.segment_id as string,
        side: rec.side as Side,
        layer: rec.layer as RuleRow['layer'],
        type: (rec.type as string | null) ?? null,
        limit_minutes: (rec.limit_minutes as number | null) ?? null,
        permit_code: (rec.permit_code as string | null) ?? null,
        permit_mode: (rec.permit_mode as RuleRow['permit_mode']) ?? null,
        color_key: (rec.color_key as string | null) ?? null,
        schedule: rec.schedule ?? null,
      };
    });
}
