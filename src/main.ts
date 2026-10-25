import { createBasemap } from './basemap';
import { bannerText, getDataSet, loadCity } from './data-loader';
import { drawCurbColors, drawNoStopping, drawPermitZones, drawRestrictions, drawSweeping, drawTimedParking, drawZoning } from './layers';
import type { TimeSelection } from './layers';
import { LAYER_KEYS, createLayerToggles, createUrlState } from './time-ui';
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

// The one shared state: day, hour and layer toggles, in memory and mirrored in the URL (M4-1).
const state = createUrlState();
createLayerToggles(app, state);

loadCity(CITY_ID)
  .then(async (city) => {
    const basemap = createBasemap(app, city.segments, city.coverage.segment_ids);
    await basemap.ready;
    const zone = city.city.time_zone;
    const initial = state.get();
    const toggles: Partial<Record<LayerKey, (visible: boolean) => void>> = {};
    const timeUpdates: Array<(at: TimeSelection) => void> = [];

    const { zoning, zoningCategories, permitZones, curbColorConfig } = city;
    if (zoning && zoningCategories) {
      toggles.zoning = drawZoning(basemap.map, zoning, zoningCategories, basemap.underStreetsLayerId, app).setVisible;
    }
    if (permitZones) {
      // After zoning, so the permit zones sit above it; both stay under the street lines and every band.
      toggles.permit_zones = drawPermitZones(basemap.map, permitZones, basemap.underStreetsLayerId, app).setVisible;
    }
    const sweeping = drawSweeping(basemap.map, city.sweeping, city.trim, initial, zone, basemap.underLabelsLayerId);
    toggles.sweeping = sweeping.setVisible;
    timeUpdates.push(sweeping.update);
    const parking = drawTimedParking(basemap.map, city.timedParking, city.trim, initial, zone, basemap.underLabelsLayerId, app);
    toggles.timed_parking = parking.setVisible;
    timeUpdates.push(parking.update);
    const restrictions = drawRestrictions(basemap.map, city.restrictions, city.trim, initial, zone, basemap.underLabelsLayerId, app);
    toggles.restrictions = restrictions.setVisible;
    timeUpdates.push(restrictions.update);
    if (curbColorConfig) {
      const curb = drawCurbColors(basemap.map, city.curbColors, curbColorConfig, city.trim, initial, zone, basemap.underLabelsLayerId, app);
      toggles.curb_colors = curb.setVisible;
      timeUpdates.push(curb.update);
    }
    // Last, so its bands are drawn above every other band layer.
    const noStopping = drawNoStopping(basemap.map, city.restrictions, city.trim, initial, zone, basemap.underLabelsLayerId, app);
    toggles.no_stopping = noStopping.setVisible;
    timeUpdates.push(noStopping.update);

    // Every layer reads the one state: a change to it restyles them all.
    let shown: AppState = initial;
    const apply = (next: AppState, force: boolean): void => {
      if (force || next.day !== shown.day || next.hour !== shown.hour) {
        for (const update of timeUpdates) update({ day: next.day, hour: next.hour });
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
