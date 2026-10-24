// Write data/burbank-sample/rules.csv (made-up rules on about 1 in 15 Burbank segments, task TD-2)
// and zoning.geojson + zoning-categories.json (SAMPLE- zones tiling the whole city, task TD-3).
//
//   npm run generate:sample
//
// Reads data/burbank/segments.geojson (never changes it). The seed is fixed, so running this again
// gives the same file; change SAMPLE_SEED in scripts/lib/sample-data.ts to get a different spread.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SegmentCollection } from './lib/build.ts';
import { generateSampleRows, rowsToCsv, SAMPLE_SEED, type PermitZoneCollection } from './lib/sample-data.ts';
import { generateZoning, zoningConfig, zoningToJson } from './lib/sample-zoning.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const segments = JSON.parse(readFileSync(resolve(root, 'data', 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;

const zoning = generateZoning(segments, 'burbank-sample');
const permitZones = JSON.parse(readFileSync(resolve(root, 'data', 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;

const rows = generateSampleRows(segments, SAMPLE_SEED, { zoning, permitZones });
writeFileSync(resolve(root, 'data', 'burbank-sample', 'rules.csv'), rowsToCsv(rows));

const mapped = new Set(rows.map((r) => r.segment_id)).size;
console.log(`burbank-sample/rules.csv: ${rows.length} rows on ${mapped} of ${segments.features.length} segments`);

writeFileSync(resolve(root, 'data', 'burbank-sample', 'zoning.geojson'), zoningToJson(zoning));
writeFileSync(resolve(root, 'data', 'burbank-sample', 'zoning-categories.json'), JSON.stringify(zoningConfig('burbank-sample'), null, 2) + '\n');
console.log(`burbank-sample/zoning.geojson: ${zoning.features.length} zones`);
