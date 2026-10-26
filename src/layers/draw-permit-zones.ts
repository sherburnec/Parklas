import type { GeoJSONSource, Map as MapLibreMap, PointLike } from 'maplibre-gl';
import type { PermitZoneBounds, PolygonCollection } from '../data-loader';
import { isolationFor, maskCollection, zoneShownFilter } from './permit-zone-isolation';
import type { ZoneIsolation } from './permit-zone-isolation';
import { permitZoneLegend, permitZoneStyle } from './permit-zones';

const SOURCE_ID = 'permit-zones';
const LAYER_IDS = ['permit-zones-fill', 'permit-zones-outline', 'permit-zones-label'];
const SELECTED_IDS = ['permit-zones-selected-fill', 'permit-zones-selected-outline'];
const MASK_SOURCE_ID = 'permit-zones-mask';
const MASK_LAYER_ID = 'permit-zones-mask-fill';
const FIT_PADDING_PX = 40;

export interface PermitZonesLayer {
  /** Show or hide the zones, their codes and the legend together (the permit overview). Starts shown. */
  setVisible(visible: boolean): void;
  /** Highlight the zone with this permit code (M4-5), or none with null. Works whether or not the zones are shown. */
  highlight(code: string | null): void;
  /**
   * Isolate the zone with this permit code (M5-9): only its polygon shows, everything outside is dimmed and the map
   * fits to its bounds. With null (All, No zone) every polygon shows again, the mask goes and the map does not move.
   * `animate` false jumps to the zone, for the first draw from a link.
   */
  isolate(zone: string, animate?: boolean): void;
  /** The permit code of the zone polygon drawn under a map point, or null. Only a visible polygon counts. */
  codeAt(point: PointLike): string | null;
}

export interface PermitZonesOptions {
  /** Called with a permit code when its legend entry is clicked. The caller sets the shared zone. */
  onSelect(code: string): void;
  /** Bounds and mask per zone from the build; without them a zone cannot be isolated. */
  bounds: PermitZoneBounds | null;
  /** The dimming mask goes under this layer, so it covers the street lines but not the curb bands. */
  maskBeforeLayerId: string;
}

/**
 * Draws the permit zones as a translucent fill, an outline and a label with the permit code, all under the layer
 * `beforeLayerId` (the street lines), so every curb band draws on top. Adds a legend of the
 * codes to `controlParent`. The toggle lives in time-ui.
 */
export function drawPermitZones(
  map: MapLibreMap,
  zones: PolygonCollection,
  beforeLayerId: string,
  controlParent: HTMLElement,
  options: PermitZonesOptions,
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

  // The chosen zone: a stronger fill and a thick outline, added after the others so they draw on top.
  const selectedIds = SELECTED_IDS;
  const matches = (code: string | null): ['==', ['get', string], string] => ['==', ['get', 'permit_code'], code ?? ''];
  map.addLayer(
    {
      id: selectedIds[0],
      type: 'fill',
      source: SOURCE_ID,
      filter: matches(null),
      paint: { 'fill-color': ['get', 'hex'], 'fill-opacity': 0.4 },
    },
    beforeLayerId,
  );
  map.addLayer(
    {
      id: selectedIds[1],
      type: 'line',
      source: SOURCE_ID,
      filter: matches(null),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'hex'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 17, 8] },
    },
    beforeLayerId,
  );

  // The outside-the-zone mask: empty until a zone is isolated. Above the street lines, under the curb bands and names.
  map.addSource(MASK_SOURCE_ID, { type: 'geojson', data: maskCollection(null) });
  map.addLayer(
    { id: MASK_LAYER_ID, type: 'fill', source: MASK_SOURCE_ID, paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.65 } },
    options.maskBeforeLayerId,
  );

  const legend = document.createElement('div');
  legend.id = 'permit-zones-legend';
  const title = document.createElement('strong');
  title.textContent = 'Permit zones';
  legend.append(title);
  for (const entry of permitZoneLegend(zones)) {
    const row = document.createElement('button');
    row.type = 'button';
    row.dataset.code = entry.code;
    row.setAttribute('aria-pressed', 'false');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = entry.hex;
    row.append(swatch, entry.code);
    row.addEventListener('click', () => options.onSelect(entry.code));
    legend.append(row);
  }
  controlParent.append(legend);

  return {
    setVisible(visible) {
      for (const id of LAYER_IDS) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      legend.hidden = !visible;
    },
    highlight(code) {
      for (const id of selectedIds) map.setFilter(id, matches(code));
      for (const row of legend.querySelectorAll<HTMLButtonElement>('button[data-code]')) {
        row.setAttribute('aria-pressed', String(row.dataset.code === code));
      }
    },
    isolate(zone, animate = true) {
      const isolation: ZoneIsolation | null = isolationFor(zone, options.bounds);
      const shown = zoneShownFilter(isolation?.code ?? null);
      // The selected layers already filter to the highlighted code; only the base layers are narrowed here.
      for (const id of LAYER_IDS) map.setFilter(id, shown);
      (map.getSource(MASK_SOURCE_ID) as GeoJSONSource).setData(maskCollection(isolation));
      if (isolation) {
        const [west, south, east, north] = isolation.bounds;
        map.fitBounds([[west, south], [east, north]], { padding: FIT_PADDING_PX, animate });
      }
    },
    codeAt(point) {
      const hit = map.queryRenderedFeatures(point, { layers: [LAYER_IDS[0]] })[0];
      return hit ? String(hit.properties.permit_code) : null;
    },
  };
}
