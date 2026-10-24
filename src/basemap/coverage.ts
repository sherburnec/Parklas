import type { Feature, FeatureCollection, LineString } from 'geojson';

export const UNMAPPED_MESSAGE = "Not yet mapped. This street's rules have not been entered.";

type SegmentProps = { segment_id: string } & Record<string, unknown>;

/**
 * Copy of the segments with a boolean `mapped` property. A segment is mapped only when its id is
 * in the coverage list; anything else is unmapped, never "unrestricted".
 */
export function tagCoverage<P extends SegmentProps>(
  segments: FeatureCollection<LineString, P>,
  mappedIds: Iterable<string>,
): FeatureCollection<LineString, P & { mapped: boolean }> {
  const mapped = new Set(mappedIds);
  const features: Feature<LineString, P & { mapped: boolean }>[] = segments.features.map((f) => ({
    ...f,
    properties: { ...f.properties, mapped: mapped.has(f.properties.segment_id) },
  }));
  return { ...segments, features };
}
