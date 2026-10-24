// Build the per-layer GeoJSON the page loads (task M2-4).
//
//   npm run build:data                 every folder in the DATA_SET (sample by default)
//   DATA_SET=real npm run build:data   the real city folders
//   npm run build:data -- burbank      one named folder, whatever the DATA_SET
//
// Runs the validator first and stops without writing anything if it finds a problem.
// Output goes to public/data/<city_id>/. A real city folder also gets data/<city_id>/trim.json written (task M2-8):
// the band geometry flags, computed from its frozen segments.geojson. A sample folder borrows the source city's.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayers, parseRuleRows, type SegmentCollection } from './lib/build.ts';
import { citiesToProcess, loadCityFiles, parseDataSet, passThroughFiles, sourceCityOf } from './lib/data-set.ts';
import { buildTrim, type BandConfig, type TrimData } from './lib/trim.ts';
import { validateCity } from './lib/validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const schemaDir = resolve(root, 'schemas');
const outRoot = resolve(root, 'public', 'data');
const bandConfig = JSON.parse(readFileSync(resolve(root, 'config', 'band-geometry.json'), 'utf8')) as BandConfig;

const schemas = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(schemaDir, f), 'utf8')) as object);

let dataSet;
try {
  dataSet = parseDataSet(process.env.DATA_SET);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const cities = citiesToProcess(dataDir, process.argv.slice(2), dataSet);

// Validate every city before writing anything.
const folders = new Map<string, Record<string, string>>();
let problems = 0;
for (const city of cities) {
  const dir = resolve(dataDir, city);
  if (!existsSync(dir)) {
    console.error(`data/${city}: no such city folder`);
    problems++;
    continue;
  }
  const files = loadCityFiles(dataDir, city);
  // A real folder's trim.json is regenerated below, so an out-of-date one must not stop the build.
  const checked = { ...files };
  if (sourceCityOf(city) === null) delete checked['trim.json'];
  for (const p of validateCity(checked, schemas)) {
    console.error(`data/${city}/${p.file}${p.row === null ? '' : `, row ${p.row}`}: ${p.reason}`);
    problems++;
  }
  folders.set(city, files);
}
if (problems > 0) {
  console.error(`Stopped: ${problems} validation problem${problems === 1 ? '' : 's'}. Nothing was built.`);
  process.exit(1);
}

const write = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data) + '\n');

for (const [city, files] of folders) {
  // Every city draws its whole street base, sample sets included.
  const segments = JSON.parse(files['segments.geojson'] ?? '{"type":"FeatureCollection","features":[]}') as SegmentCollection;
  const rows = parseRuleRows(files['rules.csv'] ?? '');
  let built;
  try {
    built = buildLayers(segments, rows, city);
  } catch (err) {
    console.error(`data/${city}/${(err as Error).message}`);
    process.exit(1);
  }

  // A real folder computes its own trim.json; a sample folder publishes the one borrowed from its source city.
  let trim: TrimData;
  if (sourceCityOf(city) === null) {
    trim = buildTrim(segments, bandConfig);
    write(resolve(dataDir, city, 'trim.json'), trim);
  } else if (files['trim.json'] !== undefined) {
    trim = JSON.parse(files['trim.json']) as TrimData;
  } else {
    console.error(`data/${city}: no trim.json to borrow from data/${sourceCityOf(city)}/. Run DATA_SET=real npm run build:data first.`);
    process.exit(1);
  }

  const out = resolve(outRoot, city);
  mkdirSync(out, { recursive: true });
  write(resolve(out, 'sweeping.geojson'), built.sweeping);
  write(resolve(out, 'timed-parking.geojson'), built.timedParking);
  write(resolve(out, 'restrictions.geojson'), built.restrictions);
  write(resolve(out, 'curb-colors.geojson'), built.curbColors);
  write(resolve(out, 'coverage.json'), built.coverage);
  write(resolve(out, 'trim.json'), trim);
  // The page loads the street list too, so it needs no other source.
  write(resolve(out, 'segments.geojson'), segments);
  // Validated above; polygons and configs pass through unchanged.
  for (const file of passThroughFiles(files)) copyFileSync(resolve(dataDir, city, file), resolve(out, file));

  console.log(
    `${city}: ${rows.length} rule rows -> sweeping ${built.sweeping.features.length}, timed parking ${built.timedParking.features.length}, ` +
      `restrictions ${built.restrictions.features.length}, curb colors ${built.curbColors.features.length}; ` +
      `${built.coverage.segment_ids.length}/${segments.features.length} segments covered; ` +
      `${Object.values(trim.segments).filter((t) => t.sliver).length} slivers, ` +
      `${Object.values(trim.segments).reduce((n, t) => n + Number(t.inner_L) + Number(t.inner_R), 0)} inner sides`,
  );
}
