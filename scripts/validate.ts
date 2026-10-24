// Validate every file in data/<city_id>/ (task M2-3).
//
//   npm run validate                 all cities under data/
//   npm run validate -- burbank      one city
//
// Prints one line per problem (file, row, reason) and exits 1 if there are any.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCity, type Problem } from './lib/validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const schemaDir = resolve(root, 'schemas');

const schemas = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(schemaDir, f), 'utf8')) as object);

const requested = process.argv.slice(2);
const cities = requested.length
  ? requested
  : readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

let total = 0;
for (const city of cities) {
  const dir = resolve(dataDir, city);
  if (!existsSync(dir)) {
    console.error(`data/${city}: no such city folder`);
    total++;
    continue;
  }
  const files: Record<string, string> = {};
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isFile()) files[f.name] = readFileSync(resolve(dir, f.name), 'utf8');
  }
  const problems: Problem[] = validateCity(files, schemas);
  for (const p of problems) {
    console.error(`data/${city}/${p.file}${p.row === null ? '' : `, row ${p.row}`}: ${p.reason}`);
  }
  console.log(`${city}: ${Object.keys(files).length} files checked, ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  total += problems.length;
}

process.exit(total > 0 ? 1 : 0);
