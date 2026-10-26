// The sample banner (tasks TD-1, M5-7): shown when the page's data folder is a sample set.
import { isSampleFolder } from './route';

export const SAMPLE_BANNER_TEXT = 'Sample data. Not real Burbank rules.';

/** The warning to show above the map, or null when the folder is real data. */
export function bannerText(folder: string): string | null {
  return isSampleFolder(folder) ? SAMPLE_BANNER_TEXT : null;
}
