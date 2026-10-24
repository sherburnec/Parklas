// Zoning layer (task M3-3): polygons filled by category. Not time-based.
import type { PolygonCollection, ZoningCategoriesConfig } from '../data-loader';

/** Shown for a zone code that is missing from the city's code map. */
export const UNKNOWN_ZONE_HEX = '#cccccc';

export interface LegendEntry {
  category: string;
  label: string;
  hex: string;
}

/** Adds `category` and `fill_color` to each zone. The exact `zone_code` stays on the feature. */
export function zoningStyle(zoning: PolygonCollection, config: ZoningCategoriesConfig): PolygonCollection {
  return {
    ...zoning,
    features: zoning.features.map((f) => {
      const category = config.zone_codes[String(f.properties?.zone_code)];
      const hex = category ? config.categories[category]?.hex : undefined;
      return { ...f, properties: { ...f.properties, category: category ?? null, fill_color: hex ?? UNKNOWN_ZONE_HEX } };
    }),
  };
}

export function zoningLegend(config: ZoningCategoriesConfig): LegendEntry[] {
  return Object.entries(config.categories).map(([category, { label, hex }]) => ({ category, label, hex }));
}
