import { createBasemap } from './basemap';
import { bannerText, getDataSet, loadCity } from './data-loader';

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

loadCity(CITY_ID)
  .then((city) => {
    createBasemap(app, city.segments);
  })
  .catch((err: unknown) => {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = `Could not load ${CITY_ID} data. ${(err as Error).message}`;
    app.append(message);
  });
