import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { SideCollection, TrimData } from '../data-loader';
import { bandOffsetPx, bandWidthPx, layoutBands } from './bands';
import type { HiddenBand } from './bands';
import {
  NO_STANDING_DASH, NO_STOPPING_BAND, NO_STOPPING_HEX, noStoppingLegend, noStoppingStyle,
} from './no-stopping';
import { restrictionRows } from './restrictions';
import type { TimeSelection } from './sweeping';
import { filterByZone } from './zone-filter';

const SOURCE_ID = 'no-stopping';

// Pixel sizes are written at z17 and scale 2x per zoom between z15 and z19 (see docs/spike-notes.md).
const zoomScaled = (px: number): ExpressionSpecification => [
  'interpolate', ['exponential', 2], ['zoom'], 15, px / 4, 17, px, 19, px * 4,
];

export interface NoStoppingLayer {
  /** Restyle every side for a new day and hour. */
  update(at: TimeSelection): void;
  /** Show or hide the whole layer, legend included. This is the toggle hook for M4-1. */
  setVisible(visible: boolean): void;
  /** Sides and slivers left off the map by the band flags. Their rows stay in the data for the click-through list. */
  hidden: HiddenBand[];
}

/**
 * Draws the no stopping (solid) and no standing (dashed) rows as one band per curb side. Added as the last band
 * layer, under `beforeLayerId`, so it is drawn above sweeping, timed parking and restrictions. Call this after the
 * other band layers are added.
 */
export function drawNoStopping(
  map: MapLibreMap,
  restrictions: SideCollection,
  trim: TrimData,
  at: TimeSelection,
  timeZone: string,
  beforeLayerId: string,
  legendParent: HTMLElement,
): NoStoppingLayer {
  const { drawn, hidden } = layoutBands(restrictionRows(restrictions, ['no_stopping', 'no_standing']), trim);
  map.addSource(SOURCE_ID, { type: 'geojson', data: noStoppingStyle(filterByZone(drawn, at.zone), at, timeZone) });
  const layerIds: string[] = [];
  // Inactive first so active bands are never hidden under them. Dashed is its own layer: line-dasharray is not data-driven.
  for (const active of [false, true]) {
    for (const dashed of [false, true]) {
      for (const sgn of [1, -1] as const) {
        const id = `no-stopping-${active ? 'active' : 'inactive'}-${dashed ? 'standing' : 'stopping'}-${sgn > 0 ? 'right' : 'left'}`;
        layerIds.push(id);
        map.addLayer(
          {
            id,
            type: 'line',
            source: SOURCE_ID,
            filter: ['all', ['==', ['get', 'active'], active], ['==', ['get', 'dashed'], dashed], ['==', ['get', 'sgn'], sgn]],
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': NO_STOPPING_HEX,
              'line-opacity': active ? 1 : 0.35,
              'line-offset': zoomScaled(bandOffsetPx(NO_STOPPING_BAND) * sgn),
              'line-width': zoomScaled(bandWidthPx()),
              ...(dashed ? { 'line-dasharray': NO_STANDING_DASH } : {}),
            },
          },
          beforeLayerId,
        );
      }
    }
  }
  const legend = document.createElement('div');
  legend.id = 'no-stopping-legend';
  const title = document.createElement('strong');
  title.textContent = 'No stopping / standing';
  legend.append(title);
  for (const entry of noStoppingLegend()) {
    const row = document.createElement('div');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = entry.dashed
      ? `repeating-linear-gradient(90deg, ${NO_STOPPING_HEX} 0 4px, transparent 4px 7px)`
      : NO_STOPPING_HEX;
    row.append(swatch, entry.label);
    legend.append(row);
  }
  legendParent.append(legend);
  return {
    hidden,
    update(next) {
      (map.getSource(SOURCE_ID) as GeoJSONSource).setData(noStoppingStyle(filterByZone(drawn, next.zone), next, timeZone));
    },
    setVisible(visible) {
      for (const id of layerIds) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      legend.hidden = !visible;
    },
  };
}
