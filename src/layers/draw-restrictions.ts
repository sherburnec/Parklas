import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { SideCollection, TrimData } from '../data-loader';
import { bandOffsetPx, bandWidthPx, layoutBands } from './bands';
import type { HiddenBand } from './bands';
import { RESTRICTIONS_BAND, restrictionRows, restrictionsLegend, restrictionsStyle } from './restrictions';
import type { TimeSelection } from './sweeping';

const SOURCE_ID = 'restrictions';

// Pixel sizes are written at z17 and scale 2x per zoom between z15 and z19 (see docs/spike-notes.md).
const zoomScaled = (px: number): ExpressionSpecification => [
  'interpolate', ['exponential', 2], ['zoom'], 15, px / 4, 17, px, 19, px * 4,
];

const LABEL_SIZE_PX = 10;

export interface RestrictionsLayer {
  /** Restyle every side for a new day and hour. */
  update(at: TimeSelection): void;
  /** Show or hide the whole layer, permit labels and legend included. */
  setVisible(visible: boolean): void;
  /** Sides and slivers left off the map by the band flags. Their rows stay in the data for the click-through list. */
  hidden: HiddenBand[];
}

/**
 * Draws the no parking rows as one band per curb side, under the layer `beforeLayerId`. The color comes from the
 * kind (permit only, specific times, any time); sides in force at `at` are drawn solid on top, the rest faded. Rows
 * with a permit code also carry their "Zone X permit ..." text along the band.
 */
export function drawRestrictions(
  map: MapLibreMap,
  restrictions: SideCollection,
  trim: TrimData,
  at: TimeSelection,
  timeZone: string,
  beforeLayerId: string,
  legendParent: HTMLElement,
): RestrictionsLayer {
  // Only no parking rows are drawn here, so the band layout (inner sides, slivers) counts only those rows.
  const { drawn, hidden } = layoutBands(restrictionRows(restrictions, ['no_parking']), trim);
  map.addSource(SOURCE_ID, { type: 'geojson', data: restrictionsStyle(drawn, at, timeZone) });
  const layerIds: string[] = [];
  // Inactive first so active bands are never hidden under them.
  for (const active of [false, true]) {
    for (const sgn of [1, -1] as const) {
      const side = sgn > 0 ? '-right' : '-left';
      const id = `restrictions-${active ? 'active' : 'inactive'}${side}`;
      layerIds.push(id);
      map.addLayer(
        {
          id,
          type: 'line',
          source: SOURCE_ID,
          filter: ['all', ['==', ['get', 'active'], active], ['==', ['get', 'sgn'], sgn]],
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'hex'],
            'line-opacity': active ? 1 : 0.3,
            'line-offset': zoomScaled(bandOffsetPx(RESTRICTIONS_BAND) * sgn),
            'line-width': zoomScaled(bandWidthPx()),
          },
        },
        beforeLayerId,
      );
    }
  }
  // Permit text, only on rows that have one. Placed beside the band, on the side it is drawn.
  for (const sgn of [1, -1] as const) {
    const id = `restrictions-permit-label${sgn > 0 ? '-right' : '-left'}`;
    layerIds.push(id);
    map.addLayer(
      {
        id,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: 16.5,
        filter: ['all', ['==', ['get', 'sgn'], sgn], ['!=', ['get', 'permit_label'], null]],
        layout: {
          'symbol-placement': 'line-center',
          'text-field': ['get', 'permit_label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': LABEL_SIZE_PX,
          'text-offset': [0, (sgn * (bandOffsetPx(RESTRICTIONS_BAND) + bandWidthPx() * 2)) / LABEL_SIZE_PX],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': ['get', 'hex'],
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
          'text-opacity': ['case', ['get', 'active'], 1, 0.5],
        },
      },
      beforeLayerId,
    );
  }
  const legend = document.createElement('div');
  legend.id = 'restrictions-legend';
  const title = document.createElement('strong');
  title.textContent = 'Restrictions';
  legend.append(title);
  for (const entry of restrictionsLegend()) {
    const row = document.createElement('div');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = entry.hex;
    row.append(swatch, entry.label);
    legend.append(row);
  }
  legendParent.append(legend);
  return {
    hidden,
    update(next) {
      (map.getSource(SOURCE_ID) as GeoJSONSource).setData(restrictionsStyle(drawn, next, timeZone));
    },
    setVisible(visible) {
      for (const id of layerIds) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      legend.hidden = !visible;
    },
  };
}
