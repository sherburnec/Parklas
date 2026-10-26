// Which data folder a page shows (task M5-7). Each folder has its own pages, /<folder>/ and /<folder>/authoring.html,
// so the page reads its folder from its own path. The pages may sit under a project path such as /Parklas/;
// everything before the folder is the site root, where data/ lives.
export type PageName = 'index' | 'authoring';

export interface Route {
  folder: string;
  page: PageName;
  /** Starts and ends with a slash, e.g. "/" or "/Parklas/". */
  siteRoot: string;
}

const FOLDER_NAME = /^[a-z0-9_-]+$/;
const SAMPLE_SUFFIX = '-sample';

/** The folder and page named by a pathname, or null when the path has no valid folder (the site root, say). */
export function parseRoute(pathname: string): Route | null {
  const parts = pathname.split('/').filter((p) => p !== '');
  const last = parts[parts.length - 1];
  const page: PageName = last === 'authoring.html' ? 'authoring' : 'index';
  if (last === 'authoring.html' || last === 'index.html') parts.pop();
  const folder = parts.pop();
  if (folder === undefined || !FOLDER_NAME.test(folder)) return null;
  return { folder, page, siteRoot: parts.length ? `/${parts.join('/')}/` : '/' };
}

/** A sample set's name ends in -sample (such as burbank-sample); its pages carry the sample banner. */
export function isSampleFolder(folder: string): boolean {
  return folder.endsWith(SAMPLE_SUFFIX) && folder.length > SAMPLE_SUFFIX.length;
}

/** Where the data folders are served from: data/ under the site root, never under the page's own folder. */
export function dataBaseUrl(siteRoot: string): string {
  return `${siteRoot}data`;
}

/** The route of the page that is open now. Throws if the path names no folder. */
export function currentRoute(): Route {
  const route = parseRoute(window.location.pathname);
  if (!route) throw new Error(`No data folder in the path "${window.location.pathname}". Open /<folder>/, such as /burbank/.`);
  return route;
}
