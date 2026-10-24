// Build the per-layer GeoJSON the page loads (task M2-4).
//
//   npm run build:data                 all cities under data/
//   npm run build:data -- burbank      one city
//
// Runs the validator first and stops without writing anything if it finds a problem.
// Output goes to public/data/<city_id>/.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayers, parseRuleRows, type SegmentCollection } from './lib/build.ts';
import { validateCity } from './lib/validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const schemaDir = resolve(root, 'schemas');
const outRoot = resolve(root, 'public', 'data');

const schemas = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(schemaDir, f), 'utf8')) as object);

const requested = process.argv.slice(2);
const cities = requested.length
  ? requested
  : readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

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
  const files: Record<string, string> = {};
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isFile()) files[f.name] = readFileSync(resolve(dir, f.name), 'utf8');
  }
  for (const p of validateCity(files, schemas)) {
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
  const segments = JSON.parse(files['segments.geojson'] ?? '{"type":"FeatureCollection","features":[]}') as SegmentCollection;
  const rows = parseRuleRows(files['rules.csv'] ?? '');
  let built;
  try {
    built = buildLayers(segments, rows, city);
  } catch (err) {
    console.error(`data/${city}/${(err as Error).message}`);
    process.exit(1);
  }

  const out = resolve(outRoot, city);
  mkdirSync(out, { recursive: true });
  write(resolve(out, 'sweeping.geojson'), built.sweeping);
  write(resolve(out, 'timed-parking.geojson'), built.timedParking);
  write(resolve(out, 'restrictions.geojson'), built.restrictions);
  write(resolve(out, 'curb-colors.geojson'), built.curbColors);
  write(resolve(out, 'coverage.json'), built.coverage);
  // Polygons were validated above and pass through unchanged.
  for (const polygons of ['zoning.geojson', 'permit-zones.geojson']) {
    if (polygons in files) copyFileSync(resolve(dataDir, city, polygons), resolve(out, polygons));
  }

  console.log(
    `${city}: ${rows.length} rule rows -> sweeping ${built.sweeping.features.length}, timed parking ${built.timedParking.features.length}, ` +
      `restrictions ${built.restrictions.features.length}, curb colors ${built.curbColors.features.length}; ` +
      `${built.coverage.segment_ids.length}/${segments.features.length} segments covered`,
  );
}
