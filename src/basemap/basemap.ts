import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, LineString } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import segmentsRaw from '../../data/burbank/segments.geojson?raw';

maplibregl.setWorkerUrl(workerUrl);

const SOURCE_ID = 'segments';
const SEGMENTS = JSON.parse(segmentsRaw) as FeatureCollection<LineString>;

// Plain background, no tiles. Glyphs are only needed so street names can be drawn as text.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: { [SOURCE_ID]: { type: 'geojson', data: SEGMENTS } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f4f4f2' } },
    {
      id: 'segments-line',
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#9a9a9a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 17, 3],
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
        'text-font': ['Open Sans Regular'],
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

export interface Basemap {
  /** Resolves once the style and street lines are loaded. */
  ready: Promise<void>;
  destroy(): void;
}

function bounds(): maplibregl.LngLatBounds {
  const b = new maplibregl.LngLatBounds();
  for (const f of SEGMENTS.features) {
    for (const c of f.geometry.coordinates) b.extend(c as [number, number]);
  }
  return b;
}

export function createBasemap(container: HTMLElement): Basemap {
  const map = new maplibregl.Map({
    container,
    style: STYLE,
    bounds: bounds(),
    fitBoundsOptions: { padding: 20 },
    attributionControl: { customAttribution: '© OpenStreetMap contributors' },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const ready = new Promise<void>((resolve) => map.once('load', () => resolve()));
  return { ready, destroy: () => map.remove() };
}
