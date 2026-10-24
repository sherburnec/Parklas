import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, LineString } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

import { tagCoverage, UNMAPPED_MESSAGE } from './coverage';

maplibregl.setWorkerUrl(workerUrl);

const SOURCE_ID = 'segments';
const UNMAPPED_LAYER_ID = 'segments-unmapped';
// Wider than the drawn line so thin streets are easy to hit with a finger.
const HIT_RADIUS_PX = 8;

// Plain background, no tiles. Glyphs are only needed so street names can be drawn as text.
function styleFor(segments: FeatureCollection<LineString>): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: { [SOURCE_ID]: { type: 'geojson', data: segments } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f4f4f2' } },
      {
        id: 'segments-line',
        type: 'line',
        source: SOURCE_ID,
        filter: ['==', ['get', 'mapped'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#9a9a9a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 17, 3],
        },
      },
      // Unmapped blocks are dashed and lighter so they never read as plain, unrestricted streets.
      {
        id: UNMAPPED_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        filter: ['!=', ['get', 'mapped'], true],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': '#c0392b',
          'line-opacity': 0.7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 17, 3],
          'line-dasharray': [1.5, 1.5],
        },
      },
      {
        id: 'segments-label',
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'street'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: {
          'text-color': '#444444',
          'text-halo-color': '#f4f4f2',
          'text-halo-width': 1.5,
        },
      },
    ],
  };
}

export interface Basemap {
  /** The map, so rule layers can draw on it. */
  map: maplibregl.Map;
  /** Rule layers that sit under the street lines are added before this layer id. */
  underStreetsLayerId: string;
  /** Rule bands that must stay under the street names are added before this layer id. */
  underLabelsLayerId: string;
  /** Resolves once the style and street lines are loaded. */
  ready: Promise<void>;
  destroy(): void;
}

function bounds(segments: FeatureCollection<LineString>): maplibregl.LngLatBounds {
  const b = new maplibregl.LngLatBounds();
  for (const f of segments.features) {
    for (const c of f.geometry.coordinates) b.extend(c as [number, number]);
  }
  return b;
}

/**
 * Draws the street lines it is given; it does not know where they came from.
 * `mappedSegmentIds` lists the segments that have rules; all others are drawn as not yet mapped.
 */
export function createBasemap(
  container: HTMLElement,
  segments: FeatureCollection<LineString, { segment_id: string } & Record<string, unknown>>,
  mappedSegmentIds: Iterable<string>,
): Basemap {
  const map = new maplibregl.Map({
    container,
    style: styleFor(tagCoverage(segments, mappedSegmentIds)),
    bounds: bounds(segments),
    fitBoundsOptions: { padding: 20 },
    attributionControl: { customAttribution: '© OpenStreetMap contributors' },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const unmappedAt = (point: maplibregl.Point) => {
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - HIT_RADIUS_PX, point.y - HIT_RADIUS_PX],
      [point.x + HIT_RADIUS_PX, point.y + HIT_RADIUS_PX],
    ];
    return map.queryRenderedFeatures(box, { layers: [UNMAPPED_LAYER_ID] }).length > 0;
  };
  map.on('click', (e) => {
    if (!unmappedAt(e.point)) return;
    new maplibregl.Popup({ closeButton: true }).setLngLat(e.lngLat).setText(UNMAPPED_MESSAGE).addTo(map);
  });
  map.on('mousemove', (e) => {
    map.getCanvas().style.cursor = unmappedAt(e.point) ? 'pointer' : '';
  });

  const ready = new Promise<void>((resolve) => map.once('load', () => resolve()));
  return { map, underStreetsLayerId: 'segments-line', underLabelsLayerId: 'segments-label', ready, destroy: () => map.remove() };
}
