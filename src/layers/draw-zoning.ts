import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PolygonCollection, ZoningCategoriesConfig } from '../data-loader';
import { zoningLegend, zoningStyle } from './zoning';

const SOURCE_ID = 'zoning';
const LAYER_ID = 'zoning-fill';

export interface ZoningLayer {
  /** Show or hide the polygons and the legend together. */
  setVisible(visible: boolean): void;
}

/**
 * Draws zoning polygons on the map, under the layer `beforeLayerId`, and puts a legend
 * with one entry per category in `legendParent`.
 */
export function drawZoning(
  map: MapLibreMap,
  zoning: PolygonCollection,
  config: ZoningCategoriesConfig,
  beforeLayerId: string,
  legendParent: HTMLElement,
): ZoningLayer {
  map.addSource(SOURCE_ID, { type: 'geojson', data: zoningStyle(zoning, config) });
  map.addLayer(
    {
      id: LAYER_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: { 'fill-color': ['get', 'fill_color'], 'fill-opacity': 0.5 },
    },
    beforeLayerId,
  );

  const legend = document.createElement('div');
  legend.id = 'zoning-legend';
  const title = document.createElement('strong');
  title.textContent = 'Zoning';
  legend.append(title);
  for (const entry of zoningLegend(config)) {
    const row = document.createElement('div');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = entry.hex;
    row.append(swatch, entry.label);
    legend.append(row);
  }
  legendParent.append(legend);
  return {
    setVisible(visible) {
      map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      legend.hidden = !visible;
    },
  };
}
