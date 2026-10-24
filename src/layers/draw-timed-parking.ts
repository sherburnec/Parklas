import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { SideCollection, TrimData } from '../data-loader';
import { bandOffsetPx, bandWidthPx, layoutBands } from './bands';
import type { HiddenBand } from './bands';
import type { TimeSelection } from './sweeping';
import { TIMED_PARKING_BAND, timedParkingStyle } from './timed-parking';

const SOURCE_ID = 'timed-parking';

// Pixel sizes are written at z17 and scale 2x per zoom between z15 and z19 (see docs/spike-notes.md).
const zoomScaled = (px: number): ExpressionSpecification => [
  'interpolate', ['exponential', 2], ['zoom'], 15, px / 4, 17, px, 19, px * 4,
];

export interface TimedParkingLayer {
  /** Restyle every side for a new day and hour. */
  update(at: TimeSelection): void;
  /** Sides and slivers left off the map by the band flags. Their rows stay in the data for the click-through list. */
  hidden: HiddenBand[];
}

/**
 * Draws timed parking as one band per curb side, under the layer `beforeLayerId`. The color comes from the
 * limit; sides in force at `at` are drawn solid on top, the rest faded. Two layers per sign, as for sweeping.
 */
export function drawTimedParking(
  map: MapLibreMap,
  parking: SideCollection,
  trim: TrimData,
  at: TimeSelection,
  timeZone: string,
  beforeLayerId: string,
): TimedParkingLayer {
  const { drawn, hidden } = layoutBands(parking, trim);
  map.addSource(SOURCE_ID, { type: 'geojson', data: timedParkingStyle(drawn, at, timeZone) });
  // Inactive first so active bands are never hidden under them.
  for (const active of [false, true]) {
    for (const sgn of [1, -1] as const) {
      map.addLayer(
        {
          id: `timed-parking-${active ? 'active' : 'inactive'}${sgn > 0 ? '-right' : '-left'}`,
          type: 'line',
          source: SOURCE_ID,
          filter: ['all', ['==', ['get', 'active'], active], ['==', ['get', 'sgn'], sgn]],
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'hex'],
            'line-opacity': active ? 1 : 0.3,
            'line-offset': zoomScaled(bandOffsetPx(TIMED_PARKING_BAND) * sgn),
            'line-width': zoomScaled(bandWidthPx()),
          },
        },
        beforeLayerId,
      );
    }
  }
  return {
    hidden,
    update(next) {
      (map.getSource(SOURCE_ID) as GeoJSONSource).setData(timedParkingStyle(drawn, next, timeZone));
    },
  };
}
