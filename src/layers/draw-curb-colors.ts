import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { CurbColorsConfig, SideCollection, TrimData } from '../data-loader';
import { bandOffsetPx, bandWidthPx, layoutBands } from './bands';
import type { HiddenBand } from './bands';
import { CURB_COLOR_BAND, curbColorLegend, curbColorStyle } from './curb-colors';
import type { TimeSelection } from './sweeping';

const SOURCE_ID = 'curb-colors';

// Pixel sizes are written at z17 and scale 2x per zoom between z15 and z19 (see docs/spike-notes.md).
const zoomScaled = (px: number): ExpressionSpecification => [
  'interpolate', ['exponential', 2], ['zoom'], 15, px / 4, 17, px, 19, px * 4,
];

export interface CurbColorsLayer {
  /** Restyle every side for a new day and hour. */
  update(at: TimeSelection): void;
  /** Sides and slivers left off the map by the band flags. Their rows stay in the data for the click-through list. */
  hidden: HiddenBand[];
}

/**
 * Draws the curb color rows as one band per curb side, in the curb color slot, under the layer `beforeLayerId`. Each
 * band takes its color from the config; sides in force at `at` are drawn solid on top, the rest faded.
 */
export function drawCurbColors(
  map: MapLibreMap,
  curbColors: SideCollection,
  config: CurbColorsConfig,
  trim: TrimData,
  at: TimeSelection,
  timeZone: string,
  beforeLayerId: string,
  legendParent: HTMLElement,
): CurbColorsLayer {
  const { drawn, hidden } = layoutBands(curbColors, trim);
  map.addSource(SOURCE_ID, { type: 'geojson', data: curbColorStyle(drawn, config, at, timeZone) });
  // Inactive first so active bands are never hidden under them.
  for (const active of [false, true]) {
    for (const sgn of [1, -1] as const) {
      map.addLayer(
        {
          id: `curb-colors-${active ? 'active' : 'inactive'}${sgn > 0 ? '-right' : '-left'}`,
          type: 'line',
          source: SOURCE_ID,
          filter: ['all', ['==', ['get', 'active'], active], ['==', ['get', 'sgn'], sgn]],
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'hex'],
            'line-opacity': active ? 1 : 0.3,
            'line-offset': zoomScaled(bandOffsetPx(CURB_COLOR_BAND) * sgn),
            'line-width': zoomScaled(bandWidthPx()),
          },
        },
        beforeLayerId,
      );
    }
  }
  const legend = document.createElement('div');
  legend.id = 'curb-colors-legend';
  const title = document.createElement('strong');
  title.textContent = 'Curb colors';
  legend.append(title);
  for (const entry of curbColorLegend(config)) {
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
      (map.getSource(SOURCE_ID) as GeoJSONSource).setData(curbColorStyle(drawn, config, next, timeZone));
    },
  };
}
