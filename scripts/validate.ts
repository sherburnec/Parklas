// Validate every file in data/<city_id>/ (task M2-3).
//
//   npm run validate                 every folder in the DATA_SET (sample by default)
//   DATA_SET=real npm run validate   the real city folders
//   npm run validate -- burbank      one named folder, whatever the DATA_SET
//
// Prints one line per problem (file, row, reason) and exits 1 if there are any errors. Warnings are printed but do not fail.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citiesToProcess, loadCityFiles, parseDataSet } from './lib/data-set.ts';
import { validateCity, type Problem } from './lib/validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const schemaDir = resolve(root, 'schemas');

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

let total = 0;
for (const city of cities) {
  const dir = resolve(dataDir, city);
  if (!existsSync(dir)) {
    console.error(`data/${city}: no such city folder`);
    total++;
    continue;
  }
  const files = loadCityFiles(dataDir, city);
  const problems: Problem[] = validateCity(files, schemas);
  for (const p of problems) {
    console.error(`${p.severity === 'warning' ? 'warning: ' : ''}data/${city}/${p.file}${p.row === null ? '' : `, row ${p.row}`}: ${p.reason}`);
  }
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;
  console.log(`${city}: ${Object.keys(files).length} files checked, ${errors} problem${errors === 1 ? '' : 's'}${warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}`);
  total += errors;
}

process.exit(total > 0 ? 1 : 0);
