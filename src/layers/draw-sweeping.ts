import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { SideCollection } from '../data-loader';
import { bandOffsetPx, bandWidthPx, SWEEPING_BAND, sweepingStyle } from './sweeping';
import type { TimeSelection } from './sweeping';

const SOURCE_ID = 'sweeping';
const ACTIVE_HEX = '#d95f02';
const INACTIVE_HEX = '#b8b8b8';

// Pixel sizes are written at z17 and scale 2x per zoom between z15 and z19 (see docs/spike-notes.md).
const zoomScaled = (px: number): ExpressionSpecification => [
  'interpolate', ['exponential', 2], ['zoom'], 15, px / 4, 17, px, 19, px * 4,
];

export interface SweepingLayer {
  /** Restyle every side for a new day and hour. */
  update(at: TimeSelection): void;
}

/**
 * Draws street sweeping as one band per curb side, under the layer `beforeLayerId`. Sides in force at
 * `at` are drawn in the strong color on top; the rest are muted grey. Each side is drawn by two
 * layers per sign because line-offset cannot take a per-feature sign inside a zoom curve.
 */
export function drawSweeping(
  map: MapLibreMap,
  sweeping: SideCollection,
  at: TimeSelection,
  timeZone: string,
  beforeLayerId: string,
): SweepingLayer {
  map.addSource(SOURCE_ID, { type: 'geojson', data: sweepingStyle(sweeping, at, timeZone) });
  // Inactive first so active bands are never hidden under them.
  for (const active of [false, true]) {
    for (const sgn of [1, -1] as const) {
      map.addLayer(
        {
          id: `sweeping-${active ? 'active' : 'inactive'}${sgn > 0 ? '-right' : '-left'}`,
          type: 'line',
          source: SOURCE_ID,
          filter: ['all', ['==', ['get', 'active'], active], ['==', ['get', 'sgn'], sgn]],
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': active ? ACTIVE_HEX : INACTIVE_HEX,
            'line-opacity': active ? 1 : 0.45,
            'line-offset': zoomScaled(bandOffsetPx(SWEEPING_BAND) * sgn),
            'line-width': zoomScaled(bandWidthPx()),
          },
        },
        beforeLayerId,
      );
    }
  }
  return {
    update(next) {
      (map.getSource(SOURCE_ID) as GeoJSONSource).setData(sweepingStyle(sweeping, next, timeZone));
    },
  };
}
