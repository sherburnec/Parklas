// Authoring map (tasks M2-7, M2-7.2): shows every segment's id, direction and L and R sides, so rule rows can be written
// against the right segment and side. A separate entry point; the public app does not link to or import it.
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { createBasemap } from '../basemap';
import { bannerText, currentRoute, loadCity } from '../data-loader';
import { formatCoordinates } from './coordinates';
import { authoringSides } from './sides';

// The page's own path names its data folder (task M5-7).
const FOLDER = currentRoute().folder;
const COLOURS = { L: '#1f6fd1', R: '#e07b00' };
const ARROW_IMAGE = 'direction-arrow';
const HIT_LAYER = 'authoring-hit';
const SELECTED_SOURCE = 'authoring-selected';
const HIT_RADIUS_PX = 8;

const app = document.getElementById('app') as HTMLElement;
const detail = document.getElementById('detail') as HTMLElement;
const coords = document.getElementById('coords') as HTMLElement;

const text = bannerText(FOLDER);
if (text) {
  const banner = document.createElement('div');
  banner.id = 'data-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = text;
  document.body.prepend(banner);
}

/** A right-pointing arrow; symbol-placement "line" turns it to follow the segment's direction. */
function arrowImage(): ImageData {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#222';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(3, 6);
  ctx.lineTo(21, 12);
  ctx.lineTo(3, 18);
  ctx.lineTo(8, 12);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

async function copy(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function show(props: Record<string, unknown>, copied: boolean) {
  const h = document.createElement('h1');
  h.textContent = `${props.street}, ${props.from_street} to ${props.to_street}`;
  const code = document.createElement('code');
  code.textContent = String(props.segment_id);
  const note = document.createElement('div');
  note.textContent = copied
    ? 'segment_id copied to the clipboard.'
    : 'Could not copy automatically. Select the segment_id above and copy it.';
  const sides = document.createElement('div');
  sides.innerHTML =
    '<span class="sw l"></span><b>L</b>: left of the arrow (blue)<br>' +
    '<span class="sw r"></span><b>R</b>: right of the arrow (orange)';
  detail.replaceChildren(h, code, note, sides);
  detail.hidden = false;
}

loadCity(FOLDER)
  .then(async (city) => {
    // Every segment counts as mapped here, so the basemap draws plain lines and shows no "not yet mapped" popup.
    const basemap = createBasemap(app, city.segments, city.segments.features.map((f) => f.properties.segment_id));
    const map = basemap.map;
    await basemap.ready;

    map.addImage(ARROW_IMAGE, arrowImage());
    map.addSource('authoring-segments', { type: 'geojson', data: city.segments });
    map.addSource(SELECTED_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    // One band per side. The offset sign comes from the build script's sideToOffset, via authoringSides.
    for (const { side, sgn } of authoringSides()) {
      map.addLayer({
        id: `authoring-side-${side}`,
        type: 'line',
        source: 'authoring-segments',
        paint: {
          'line-color': COLOURS[side],
          'line-width': 2,
          'line-offset': ['interpolate', ['exponential', 2], ['zoom'], 15, sgn * 4, 19, sgn * 64],
        },
      });
      // Letter beside each band. Text runs along the segment's direction (never flipped upright), so +y is right of travel.
      map.addLayer({
        id: `authoring-label-${side}`,
        type: 'symbol',
        source: 'authoring-segments',
        minzoom: 16,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 200,
          'text-field': side,
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-keep-upright': false,
          'text-offset': [0, sgn * 1.4],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': COLOURS[side], 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });
    }
    map.addLayer({
      id: 'authoring-arrows',
      type: 'symbol',
      source: 'authoring-segments',
      minzoom: 14,
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 80, 'icon-image': ARROW_IMAGE, 'icon-size': 0.6, 'icon-allow-overlap': true },
    });
    map.addLayer({
      id: 'authoring-selected',
      type: 'line',
      source: SELECTED_SOURCE,
      paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.35 },
    });
    // Wide and invisible so thin streets are easy to hit.
    map.addLayer({
      id: HIT_LAYER,
      type: 'line',
      source: 'authoring-segments',
      paint: { 'line-width': HIT_RADIUS_PX * 2, 'line-opacity': 0 },
    });

    map.on('click', async (e: MapMouseEvent) => {
      coords.textContent = `Last click (lng, lat): ${formatCoordinates(e.lngLat)}`;
      coords.hidden = false;
      const hit = map.queryRenderedFeatures(e.point, { layers: [HIT_LAYER] })[0];
      if (!hit) return;
      const props = hit.properties as Record<string, unknown>;
      const whole = city.segments.features.find((f) => f.properties.segment_id === props.segment_id);
      (map.getSource(SELECTED_SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features: whole ? [whole] : [] });
      show(props, await copy(String(props.segment_id)));
    });
    map.on('mousemove', (e) => {
      map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: [HIT_LAYER] }).length ? 'pointer' : '';
    });
  })
  .catch((err: unknown) => {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = `Could not load ${FOLDER} data. ${(err as Error).message}`;
    app.append(message);
  });
