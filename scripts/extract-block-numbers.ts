// One-time extraction of block numbers from OpenStreetMap addresses (task M5-5), run like extract-burbank-segments.ts.
//
//   node scripts/extract-block-numbers.ts
//
// Reads data/burbank/segments.geojson (never writes it) and writes data/burbank/blocks.csv and blocks-report.md.
// Rows with source=manual in an existing blocks.csv are kept as they are. A block number is never guessed:
// see scripts/lib/block-numbers.ts for the rules. Plain node:https is used on purpose; fetch() belongs to data-loader only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignAddresses, elementsToAddresses, mergeBlockRows, renderReport, summariseSegments, type OverpassAddressElement } from './lib/block-numbers.ts';
import { parseBlockRows, serializeBlockRows } from './lib/blocks.ts';
import type { SegmentCollection } from './lib/segments.ts';

const CITY_ID = 'burbank';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'data', CITY_ID);
const segmentsPath = resolve(dir, 'segments.geojson');
const blocksPath = resolve(dir, 'blocks.csv');
const reportPath = resolve(dir, 'blocks-report.md');

// The same endpoints as extract-burbank-segments.ts.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// Same city boundary as the segment extraction; every node, way and relation with a house number and a street.
const QUERY = `[out:json][timeout:180];
relation["boundary"="administrative"]["admin_level"="8"]["name"="Burbank"](34.12,-118.40,34.26,-118.22);
map_to_area->.city;
nwr(area.city)["addr:housenumber"]["addr:street"];
out center tags;`;

function post(url: string, body: string): Promise<string> {
  return new Promise((ok, fail) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'curb-map-block-number-extract/1.0',
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

async function download(): Promise<OverpassAddressElement[]> {
  const body = `data=${encodeURIComponent(QUERY)}`;
  for (const url of ENDPOINTS) {
    try {
      console.log(`Querying ${url} ...`);
      const json = JSON.parse(await post(url, body)) as { elements: OverpassAddressElement[]; remark?: string };
      if (json.remark) console.warn(`Overpass remark: ${json.remark}`);
      return json.elements;
    } catch (err) {
      console.warn(String(err));
    }
  }
  throw new Error('All Overpass endpoints failed. Nothing was written; no block numbers were made up.');
}

async function main() {
  const segments = JSON.parse(readFileSync(segmentsPath, 'utf8')) as SegmentCollection;
  const elements = await download();
  const addresses = elementsToAddresses(elements);
  if (addresses.length === 0) throw new Error('Overpass returned no usable addresses; refusing to write an all-empty file.');
  console.log(`${elements.length} address elements, ${addresses.length} with a usable house number.`);

  const found = assignAddresses(addresses, segments.features);
  const fresh = summariseSegments(segments.features.map((f) => f.properties.segment_id), found);
  const existing = existsSync(blocksPath) ? parseBlockRows(readFileSync(blocksPath, 'utf8')) : [];
  const rows = mergeBlockRows(existing, fresh);

  writeFileSync(blocksPath, serializeBlockRows(rows));
  const streetOf = new Map(segments.features.map((f) => [f.properties.segment_id, f.properties.street]));
  writeFileSync(reportPath, renderReport(CITY_ID, rows, streetOf));

  const numbered = rows.filter((r) => r.block_number !== null).length;
  console.log(`Wrote ${rows.length} rows to ${blocksPath} (${existing.filter((r) => r.source === 'manual').length} manual rows kept).`);
  console.log(`Blocks numbered: ${numbered} of ${rows.length}. Blocks needing hand entry: ${rows.length - numbered} (see ${reportPath}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
