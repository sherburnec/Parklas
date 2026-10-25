import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PolygonCollection } from '../data-loader';
import { permitZoneLegend, permitZoneStyle } from './permit-zones';

const SOURCE_ID = 'permit-zones';
const LAYER_IDS = ['permit-zones-fill', 'permit-zones-outline', 'permit-zones-label'];

export interface PermitZonesLayer {
  /** Show or hide the zones, their codes and the legend together (the permit overview). */
  setVisible(visible: boolean): void;
}

/**
 * Draws the permit zones as a translucent fill, an outline and a label with the permit code, all under the layer
 * `beforeLayerId` (the street lines), so every curb band draws on top. Adds a toggle button and a legend of the
 * codes to `controlParent`. The overview starts on.
 */
export function drawPermitZones(
  map: MapLibreMap,
  zones: PolygonCollection,
  beforeLayerId: string,
  controlParent: HTMLElement,
): PermitZonesLayer {
  map.addSource(SOURCE_ID, { type: 'geojson', data: permitZoneStyle(zones) });
  map.addLayer(
    {
      id: LAYER_IDS[0],
      type: 'fill',
      source: SOURCE_ID,
      paint: { 'fill-color': ['get', 'hex'], 'fill-opacity': 0.25 },
    },
    beforeLayerId,
  );
  map.addLayer(
    {
      id: LAYER_IDS[1],
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'hex'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 17, 3], 'line-opacity': 0.9 },
    },
    beforeLayerId,
  );
  map.addLayer(
    {
      id: LAYER_IDS[2],
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 12, 17, 18],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': ['get', 'hex'], 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    },
    beforeLayerId,
  );

  const panel = document.createElement('div');
  panel.id = 'permit-overview';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Permit overview';
  panel.append(button);

  const legend = document.createElement('div');
  legend.id = 'permit-zones-legend';
  const title = document.createElement('strong');
  title.textContent = 'Permit zones';
  legend.append(title);
  for (const entry of permitZoneLegend(zones)) {
    const row = document.createElement('div');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = entry.hex;
    row.append(swatch, entry.code);
    legend.append(row);
  }
  panel.append(legend);
  controlParent.append(panel);

  const setVisible = (visible: boolean): void => {
    for (const id of LAYER_IDS) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    legend.hidden = !visible;
    button.setAttribute('aria-pressed', String(visible));
  };
  let visible = true;
  button.addEventListener('click', () => {
    visible = !visible;
    setVisible(visible);
  });
  setVisible(true);
  return { setVisible };
}
