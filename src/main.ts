import { createBasemap } from './basemap';
import { bannerText, getDataSet } from './data-loader';

// The banner goes in before the map so the map is sized below it.
const text = bannerText(getDataSet());
if (text) {
  const banner = document.createElement('div');
  banner.id = 'data-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = text;
  document.body.prepend(banner);
}

createBasemap(document.getElementById('app') as HTMLElement);
