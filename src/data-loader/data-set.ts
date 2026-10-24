// The DATA_SET setting (task TD-1): "sample" (default) or "real". The same value drives
// npm run validate, npm run build:data and the page; Vite passes it through (see envPrefix).
export type DataSet = 'sample' | 'real';

export const SAMPLE_BANNER_TEXT = 'Sample data. Not real Burbank rules.';

export function resolveDataSet(value: string | undefined): DataSet {
  if (value === undefined || value === '') return 'sample';
  if (value === 'sample' || value === 'real') return value;
  throw new Error(`DATA_SET must be "sample" or "real", not "${value}"`);
}

/** The data folder (and built-file folder) for a city under the chosen data set. */
export function dataFolder(cityId: string, dataSet: DataSet): string {
  return dataSet === 'sample' ? `${cityId}-sample` : cityId;
}

/** The warning to show above the map, or null when the data is real. */
export function bannerText(dataSet: DataSet): string | null {
  return dataSet === 'sample' ? SAMPLE_BANNER_TEXT : null;
}

export function getDataSet(): DataSet {
  return resolveDataSet(import.meta.env.DATA_SET as string | undefined);
}
