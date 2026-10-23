// One-time extraction of Burbank, CA street blocks from OpenStreetMap (task M1-1).
//
//   node scripts/extract-burbank-segments.ts            first run; refuses if the file exists
//   node scripts/extract-burbank-segments.ts --force    re-extract and report which segment_ids changed
//
// segments.geojson is frozen: rule rows are keyed to its segment_ids, so re-extracting is deliberate.
// Plain node:https is used on purpose; fetch() belongs to data-loader only (architecture rule 3).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSegments,
  diffSegments,
  findBlocksCrossingIntersections,
  type OsmElement,
  type SegmentCollection,
} from './lib/segments.ts';

const CITY_ID = 'burbank';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'data', CITY_ID);
const segmentsPath = resolve(dir, 'segments.geojson');
const cityPath = resolve(dir, 'city.json');

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// Burbank's city boundary (admin_level 8), picked by name inside a box around the city so
// other Burbanks are not matched. Only the road classes isCurbRoad() can keep are requested.
const QUERY = `[out:json][timeout:180];
relation["boundary"="administrative"]["admin_level"="8"]["name"="Burbank"](34.12,-118.40,34.26,-118.22);
map_to_area->.city;
way(area.city)["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street)$"]["name"];
out body;
>;
out skel qt;`;

function post(url: string, body: string): Promise<string> {
  return new Promise((ok, fail) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'curb-map-segment-extract/1.0',
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 200) ok(text);
          else fail(new Error(`${url} answered ${res.statusCode}: ${text.slice(0, 200)}`));
        });
      },
    );
    req.on('error', fail);
    req.write(body);
    req.end();
  });
}

async function download(): Promise<OsmElement[]> {
  const body = `data=${encodeURIComponent(QUERY)}`;
  for (const url of ENDPOINTS) {
    try {
      console.log(`Querying ${url} ...`);
      const json = JSON.parse(await post(url, body)) as { elements: OsmElement[]; remark?: string };
      if (json.remark) console.warn(`Overpass remark: ${json.remark}`);
      return json.elements;
    } catch (err) {
      console.warn(String(err));
    }
  }
  throw new Error('All Overpass endpoints failed.');
}

function serialize(fc: SegmentCollection): string {
  // One feature per line keeps git diffs readable.
  return `{"type":"FeatureCollection","features":[\n${fc.features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}

function report(label: string, ids: string[]) {
  console.log(`  ${label}: ${ids.length}`);
  for (const id of ids.slice(0, 50)) console.log(`    ${id}`);
  if (ids.length > 50) console.log(`    ... and ${ids.length - 50} more`);
}

async function main() {
  const force = process.argv.includes('--force');
  const exists = existsSync(segmentsPath);
  if (exists && !force) {
    console.error(
      `Refusing to overwrite ${segmentsPath}.\n` +
        'It is frozen: rule rows are keyed to its segment_ids. Re-run with --force to re-extract; ' +
        'the changed segment_ids will be listed.',
    );
    process.exit(1);
  }

  const previous = exists ? (JSON.parse(readFileSync(segmentsPath, 'utf8')) as SegmentCollection) : null;

  const elements = await download();
  const fc = buildSegments(elements, CITY_ID);
  if (fc.features.length === 0) throw new Error('No blocks were built; refusing to write an empty file.');

  const crossing = findBlocksCrossingIntersections(fc);
  if (crossing.length) {
    throw new Error(`${crossing.length} blocks cross an intersection, e.g. ${crossing.slice(0, 5).join(', ')}`);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(segmentsPath, serialize(fc));
  const streets = new Set(fc.features.map((f) => f.properties.street));
  console.log(`Wrote ${fc.features.length} blocks on ${streets.size} named streets to ${segmentsPath}`);

  if (!existsSync(cityPath)) {
    writeFileSync(cityPath, `${JSON.stringify({ city_id: CITY_ID, name: 'Burbank, CA', time_zone: 'America/Los_Angeles' }, null, 2)}\n`);
    console.log(`Wrote ${cityPath}`);
  }

  if (previous) {
    const diff = diffSegments(previous, fc);
    console.log('Changes against the previous segments.geojson:');
    report('added', diff.added);
    report('removed', diff.removed);
    report('changed (same id, new name or geometry)', diff.changed);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
