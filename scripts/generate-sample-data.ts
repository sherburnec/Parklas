// Write data/burbank-sample/rules.csv (made-up rules on TARGET_MAPPED_SHARE of Burbank segments, tasks TD-2 and TD-2.2)
// zoning.geojson + zoning-categories.json (SAMPLE- zones tiling the whole city, task TD-3),
// permit-zones.geojson (8 DEMO- permit zones tiling the whole city, tasks TD-8 and TD-8.2)
// curb-colors.json (the five sample curb colors, task TD-7)
// and test-cases.md (the fixed edge-case sides at the end of rules.csv, with their expected results, task TD-9).
//
//   npm run generate:sample
//
// Reads data/burbank/segments.geojson and trim.json (never changes them). The seed is fixed, so running this again
// gives the same file; change SAMPLE_SEED in scripts/lib/sample-data.ts to get a different spread.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SegmentCollection } from './lib/build.ts';
import { CURB_COLORS, curbColorsToJson, generateSampleRows, rowsToCsv, SAMPLE_SEED } from './lib/sample-data.ts';
import { addEdgeCases, edgeCasesToMarkdown, pickEdgeCases } from './lib/sample-edge-cases.ts';
import { generatePermitZones, permitZonesToJson } from './lib/sample-permit-zones.ts';
import { generateZoning, zoningConfig, zoningToJson } from './lib/sample-zoning.ts';
import type { TrimData } from './lib/trim.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const segments = JSON.parse(readFileSync(resolve(root, 'data', 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;

const trim = JSON.parse(readFileSync(resolve(root, 'data', 'burbank', 'trim.json'), 'utf8')) as TrimData;

const zoning = generateZoning(segments, 'burbank-sample');
const permitZones = generatePermitZones(segments, 'burbank-sample');
writeFileSync(resolve(root, 'data', 'burbank-sample', 'permit-zones.geojson'), permitZonesToJson(permitZones));
console.log(`burbank-sample/permit-zones.geojson: ${permitZones.features.length} zones`);

const baseRows = generateSampleRows(segments, SAMPLE_SEED, { zoning, permitZones });
const edgeCases = pickEdgeCases(baseRows, segments, trim, SAMPLE_SEED);
const rows = addEdgeCases(baseRows, edgeCases);
writeFileSync(resolve(root, 'data', 'burbank-sample', 'rules.csv'), rowsToCsv(rows));
writeFileSync(resolve(root, 'data', 'burbank-sample', 'test-cases.md'), edgeCasesToMarkdown(edgeCases, segments, permitZones));
console.log(`burbank-sample/test-cases.md: ${edgeCases.length} edge-case sides, ${rows.length - baseRows.length} rows`);

const mapped = new Set(rows.map((r) => r.segment_id)).size;
console.log(`burbank-sample/rules.csv: ${rows.length} rows on ${mapped} of ${segments.features.length} segments`);

writeFileSync(resolve(root, 'data', 'burbank-sample', 'curb-colors.json'), curbColorsToJson('burbank-sample'));
console.log(`burbank-sample/curb-colors.json: ${Object.keys(CURB_COLORS).length} colors`);

writeFileSync(resolve(root, 'data', 'burbank-sample', 'zoning.geojson'), zoningToJson(zoning));
writeFileSync(resolve(root, 'data', 'burbank-sample', 'zoning-categories.json'), JSON.stringify(zoningConfig('burbank-sample'), null, 2) + '\n');
console.log(`burbank-sample/zoning.geojson: ${zoning.features.length} zones`);
