// Point every block of the frozen segments file in the city-grid direction (task M5-6).
//
//   node scripts/orient-burbank-segments.ts
//
// Rewrites data/burbank/segments.geojson in place. Only direction changes: ids, names and coordinates stay, and a
// reversed block swaps from_street and to_street. Every L and R row on a reversed block now lands on the other curb,
// so rows in data/burbank/rules.csv on those blocks are listed for checking. Running it again reverses nothing.
// Afterwards, run DATA_SET=real npm run build:data (trim.json) and npm run generate:sample (the sample set).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRuleRows } from './lib/build.ts';
import { BURBANK_GRID, orientSegments } from './lib/orientation.ts';
import { serializeSegments, type SegmentCollection } from './lib/segments.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const segmentsPath = resolve(root, 'data', 'burbank', 'segments.geojson');
const rulesPath = resolve(root, 'data', 'burbank', 'rules.csv');

const frozen = JSON.parse(readFileSync(segmentsPath, 'utf8')) as SegmentCollection;
const { collection, reversed } = orientSegments(frozen, BURBANK_GRID);
console.log(`${reversed.length} of ${frozen.features.length} blocks reversed.`);
if (reversed.length === 0) process.exit(0);
writeFileSync(segmentsPath, serializeSegments(collection));
console.log(`Wrote ${segmentsPath}`);

if (existsSync(rulesPath)) {
  const flipped = new Set(reversed);
  const rows = parseRuleRows(readFileSync(rulesPath, 'utf8')).filter((r) => flipped.has(r.segment_id));
  if (rows.length) {
    console.warn(`${rows.length} rows in data/burbank/rules.csv sit on a reversed block. Swap their L and R:`);
    for (const r of rows) console.warn(`  ${r.segment_id} ${r.side} ${r.layer}`);
  }
}
