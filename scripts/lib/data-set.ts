// Which data folders the scripts work on (task TD-1): the DATA_SET setting plus the folder reader
// shared by validate and build:data.
//
// DATA_SET=sample (the default) uses the folders named <city_id>-sample, such as data/burbank-sample/.
// DATA_SET=real uses every other folder. A sample folder has no segments.geojson of its own: it is
// read from the source city's folder, so the frozen file is never copied. trim.json, which is generated
// from it, is borrowed the same way.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export type DataSet = 'sample' | 'real';

const SAMPLE_SUFFIX = '-sample';

export function parseDataSet(value: string | undefined): DataSet {
  if (value === undefined || value === '') return 'sample';
  if (value === 'sample' || value === 'real') return value;
  throw new Error(`DATA_SET must be "sample" or "real", not "${value}"`);
}

/** The city a sample folder borrows its street segments from, or null for a real folder. */
export function sourceCityOf(folder: string): string | null {
  return folder.endsWith(SAMPLE_SUFFIX) ? folder.slice(0, -SAMPLE_SUFFIX.length) : null;
}

export function selectCities(folders: string[], dataSet: DataSet): string[] {
  return folders.filter((f) => (sourceCityOf(f) !== null) === (dataSet === 'sample'));
}

/** Folders to work on: the ones named on the command line, else every folder in the chosen data set. */
export function citiesToProcess(dataDir: string, requested: string[], dataSet: DataSet): string[] {
  if (requested.length) return requested;
  const folders = readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  return selectCities(folders, dataSet);
}

/**
 * Every data file in data/<city>/ by name; Markdown notes (the sample set's test-cases.md, task TD-9) are not data and are skipped.
 * A sample folder also gets its source city's segments.geojson.
 */
export function loadCityFiles(dataDir: string, city: string): Record<string, string> {
  const dir = resolve(dataDir, city);
  const files: Record<string, string> = {};
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isFile() && !f.name.endsWith('.md')) files[f.name] = readFileSync(resolve(dir, f.name), 'utf8');
  }
  const source = sourceCityOf(city);
  if (source !== null && !('segments.geojson' in files)) {
    const path = resolve(dataDir, source, 'segments.geojson');
    if (!existsSync(path)) throw new Error(`data/${city} borrows its streets from data/${source}/segments.geojson, which does not exist`);
    files['segments.geojson'] = readFileSync(path, 'utf8');
  }
  // trim.json is borrowed the same way. build:data writes it for the real city, so it may not exist yet.
  if (source !== null && !('trim.json' in files)) {
    const path = resolve(dataDir, source, 'trim.json');
    if (existsSync(path)) files['trim.json'] = readFileSync(path, 'utf8');
  }
  return files;
}

/** Authored files the page loads as they are (task M3-1); only the ones the folder has. */
export const PASS_THROUGH_FILES = ['city.json', 'zoning.geojson', 'permit-zones.geojson', 'curb-colors.json', 'zoning-categories.json'];

export function passThroughFiles(files: Record<string, string>): string[] {
  return PASS_THROUGH_FILES.filter((f) => f in files);
}
