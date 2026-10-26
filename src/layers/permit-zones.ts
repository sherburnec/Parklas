// Permit zones layer (task M3-9): polygons labelled with the permit code. Not time-based.
import type { PolygonCollection } from '../data-loader';

/**
 * Zone colors. Chosen to stay apart from each other; the fill is translucent and sits under the street lines and
 * every curb band, so they only tint the ground.
 */
export const PERMIT_ZONE_HEXES = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#808000',
];

/**
 * Fill opacity of the zone polygons (M5-9.2): `all` for every zone, `selected` for the highlighted or isolated one.
 * The chosen zone is lighter, so the curb bands inside it stay readable; its thick outline marks it instead.
 */
export const PERMIT_ZONE_FILL_OPACITY = { all: 0.125, selected: 0.05 } as const;

/**
 * The fill-opacity paint value with `code` highlighted: the lighter value on that zone, the base value on the rest.
 * With null, a plain number, so every fill is unchanged.
 */
export function zoneFillOpacity(code: string | null): number | ['case', ['==', ['get', string], string], number, number] {
  if (code === null) return PERMIT_ZONE_FILL_OPACITY.all;
  return ['case', ['==', ['get', 'permit_code'], code], PERMIT_ZONE_FILL_OPACITY.selected, PERMIT_ZONE_FILL_OPACITY.all];
}

export interface PermitZoneLegendEntry {
  code: string;
  hex: string;
}

/** The sorted distinct codes. A zone's color depends on its place in this list, not on file order. */
function sortedCodes(zones: PolygonCollection): string[] {
  return [...new Set(zones.features.map((f) => String(f.properties?.permit_code)))].sort();
}

const hexFor = (codes: string[], code: string): string => PERMIT_ZONE_HEXES[codes.indexOf(code) % PERMIT_ZONE_HEXES.length];

/** Adds `label` (the permit code) and `hex` to each zone. */
export function permitZoneStyle(zones: PolygonCollection): PolygonCollection {
  const codes = sortedCodes(zones);
  return {
    ...zones,
    features: zones.features.map((f) => {
      const code = String(f.properties?.permit_code);
      return { ...f, properties: { ...f.properties, label: code, hex: hexFor(codes, code) } };
    }),
  };
}

export function permitZoneLegend(zones: PolygonCollection): PermitZoneLegendEntry[] {
  const codes = sortedCodes(zones);
  return codes.map((code) => ({ code, hex: hexFor(codes, code) }));
}
