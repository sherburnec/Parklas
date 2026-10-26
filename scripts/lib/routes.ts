/// <reference types="node" />
// The site's routes (task M5-7): one set of pages per folder under data/. The build, the dev server and the 404 page
// all read the folder list from here, so a new data folder gets its routes with no code change.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const FOLDER_NAME = /^[a-z0-9_-]+$/;

/** Every city folder under data/, sample sets included, sorted. A folder counts if it has a city.json. */
export function dataFolders(dataDir: string): string[] {
  return readdirSync(dataDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && FOLDER_NAME.test(d.name) && existsSync(resolve(dataDir, d.name, 'city.json')))
    .map((d) => d.name)
    .sort();
}

/** The Vite page entries for these folders: key to html path, relative to the project root. */
export function routeEntries(folders: string[]): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const folder of folders) {
    for (const page of ['index', 'authoring']) entries[`${folder}/${page}`] = `${folder}/${page}.html`;
  }
  return entries;
}

/** A page that sends the visitor on to `target` (relative to the redirect page), keeping the query and hash. */
export function redirectPage(target: string): string {
  const url = `./${target}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Curb &amp; Zoning Map</title>
    <script>location.replace(${JSON.stringify(url)} + location.search + location.hash);</script>
    <noscript><meta http-equiv="refresh" content="0; url=${url}"></noscript>
  </head>
  <body>
    <p><a href="${url}">Continue to the map</a></p>
  </body>
</html>
`;
}

/** Normalises a site base path such as "Parklas" or "/Parklas/" to "/Parklas/"; empty means the host's root. */
export function siteBase(value: string | undefined): string {
  const trimmed = (value ?? '').replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

function folderListPage(title: string, intro: string, items: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      body { max-width: 32rem; margin: 3rem auto; padding: 0 16px; font: 16px/1.5 system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${intro}</p>
    <ul>
${items}
    </ul>
  </body>
</html>
`;
}

/** The site root: a list of the maps to choose from. Links are relative, so it works under any project path. The authoring pages are not listed. */
export function chooserPage(folders: string[], defaultFolder: string): string {
  const items = folders
    .map((f) => `      <li><a href="./${f}/">${f}</a>${f === defaultFolder ? ' (default)' : ''}</li>`)
    .join('\n');
  return folderListPage('Curb &amp; Zoning Map', 'Choose a map:', items);
}

/**
 * The page GitHub Pages shows for an unknown path. It can be served at any depth, so its links start at the site base
 * rather than being relative. The authoring pages are not listed.
 */
export function notFoundPage(folders: string[], base: string): string {
  const items = folders.map((f) => `      <li><a href="${base}${f}/">${f}</a></li>`).join('\n');
  return folderListPage('Page not found', 'There is no page at this address. These maps exist:', items);
}
