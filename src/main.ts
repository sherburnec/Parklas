import { createBasemap, UNMAPPED_MESSAGE } from './basemap';
import { createCurbDetail, createDayZones } from './curb-detail';
import { bannerText, getDataSet, loadCity } from './data-loader';
import {
  drawCurbColors, drawNoStopping, drawPermitZones, drawRestrictions, drawSweeping, drawTimedParking, drawZoning, permitZoneLegend,
} from './layers';
import type { TimeSelection } from './layers';
import { LAYER_KEYS, ZONE_ALL, ZONE_NONE, createLayerToggles, createTimeControls, createUrlState, createZoneFilter } from './time-ui';
import type { AppState, LayerKey } from './time-ui';

const CITY_ID = 'burbank';

// The banner goes in before the map so the map is sized below it.
const text = bannerText(getDataSet());
if (text) {
  const banner = document.createElement('div');
  banner.id = 'data-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = text;
  document.body.prepend(banner);
}

const app = document.getElementById('app') as HTMLElement;
const mapEl = document.getElementById('map') as HTMLElement;
const panel = document.getElementById('panel') as HTMLElement;
// Every control and legend goes in here: floating over the map on wide screens, a bottom panel on narrow ones (M5-1).
const controls = document.getElementById('controls') as HTMLElement;
const legends = document.getElementById('legends') as HTMLElement;
const detailHost = document.getElementById('curb-detail-host') as HTMLElement;

// On a phone the panel starts collapsed so the map is visible; the toggle only changes layout, not data (state stays in memory).
const panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement;
const setPanelOpen = (open: boolean): void => {
  panel.toggleAttribute('data-collapsed', !open);
  panelToggle.setAttribute('aria-expanded', String(open));
  panelToggle.textContent = open ? 'Hide controls' : 'Show controls';
};
setPanelOpen(!window.matchMedia('(max-width: 700px)').matches);
panelToggle.addEventListener('click', () => setPanelOpen(panel.hasAttribute('data-collapsed')));

// The one shared state: day, hour and layer toggles, in memory and mirrored in the URL (M4-1).
const state = createUrlState();
createLayerToggles(controls, state);

loadCity(CITY_ID)
  .then(async (city) => {
    const basemap = createBasemap(mapEl, city.segments, city.coverage.segment_ids);
    await basemap.ready;
    const updated = document.getElementById('data-updated') as HTMLElement;
    updated.textContent = `Data last updated ${city.metadata.last_updated}`;
    updated.hidden = false;
    const zone = city.city.time_zone;
    createTimeControls(controls, state, zone);
    const toggles: Partial<Record<LayerKey, (visible: boolean) => void>> = {};
    const timeUpdates: Array<(at: TimeSelection) => void> = [];

    const { zoning, zoningCategories, permitZones, curbColorConfig } = city;
    if (zoning && zoningCategories) {
      toggles.zoning = drawZoning(basemap.map, zoning, zoningCategories, basemap.underStreetsLayerId, legends).setVisible;
    }
    let highlightZone: (code: string | null) => void = () => {};
    if (permitZones) {
      // After zoning, so the permit zones sit above it; both stay under the street lines and every band.
      const zones = drawPermitZones(basemap.map, permitZones, basemap.underStreetsLayerId, controls);
      toggles.permit_zones = zones.setVisible;
      highlightZone = zones.highlight;
      // Zone filter (M4-5): the selector lists the codes in the permit zones file.
      createZoneFilter(controls, state, permitZoneLegend(permitZones).map((e) => e.code));
    } else if (state.get().zone !== ZONE_ALL) {
      state.set({ zone: ZONE_ALL }); // no zones to filter by, so a zone in the URL cannot apply
    }
    // Read after the zone selector has reset any stale zone in the URL.
    const initial = state.get();
    const sweeping = drawSweeping(basemap.map, city.sweeping, city.trim, initial, zone, basemap.underLabelsLayerId);
    toggles.sweeping = sweeping.setVisible;
    timeUpdates.push(sweeping.update);
    const parking = drawTimedParking(basemap.map, city.timedParking, city.trim, initial, zone, basemap.underLabelsLayerId, legends);
    toggles.timed_parking = parking.setVisible;
    timeUpdates.push(parking.update);
    const restrictions = drawRestrictions(basemap.map, city.restrictions, city.trim, initial, zone, basemap.underLabelsLayerId, legends);
    toggles.restrictions = restrictions.setVisible;
    timeUpdates.push(restrictions.update);
    if (curbColorConfig) {
      const curb = drawCurbColors(basemap.map, city.curbColors, curbColorConfig, city.trim, initial, zone, basemap.underLabelsLayerId, legends);
      toggles.curb_colors = curb.setVisible;
      timeUpdates.push(curb.update);
    }
    // Last, so its bands are drawn above every other band layer.
    const noStopping = drawNoStopping(basemap.map, city.restrictions, city.trim, initial, zone, basemap.underLabelsLayerId, legends);
    toggles.no_stopping = noStopping.setVisible;
    timeUpdates.push(noStopping.update);

    // Clicking a block lists every rule on both its sides, from the loaded rows rather than what is drawn (M4-3).
    const detail = createCurbDetail(detailHost, city, { timeZone: zone, unmappedMessage: UNMAPPED_MESSAGE, state });
    basemap.onSegmentClick((segmentId) => detail.show(segmentId));

    // Timed parking in force on the chosen day; picking one centres the map and opens its block (M4-4).
    createDayZones(controls, city, {
      timeZone: zone,
      state,
      onSelect: (z) => {
        basemap.map.easeTo({ center: z.center, zoom: Math.max(basemap.map.getZoom(), 17) });
        detail.show(z.segmentId);
      },
    });

    // Every layer reads the one state: a change to it restyles them all.
    let shown: AppState = initial;
    const apply = (next: AppState, force: boolean): void => {
      if (force || next.day !== shown.day || next.hour !== shown.hour || next.zone !== shown.zone) {
        for (const update of timeUpdates) update({ day: next.day, hour: next.hour, zone: next.zone });
      }
      if (force || next.zone !== shown.zone) {
        highlightZone(next.zone === ZONE_ALL || next.zone === ZONE_NONE ? null : next.zone);
      }
      for (const key of LAYER_KEYS) {
        if (force || next.visible[key] !== shown.visible[key]) toggles[key]?.(next.visible[key]);
      }
      shown = next;
    };
    apply(state.get(), true);
    state.subscribe((next) => apply(next, false));
  })
  .catch((err: unknown) => {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = `Could not load ${CITY_ID} data. ${(err as Error).message}`;
    app.append(message);
  });
