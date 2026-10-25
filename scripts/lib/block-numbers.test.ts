import { describe, expect, it } from 'vitest';
import type { BlockRow } from './blocks.ts';
import {
  assignAddresses,
  blockNumberFor,
  distanceToLineM,
  elementsToAddresses,
  hundredOf,
  mergeBlockRows,
  normaliseStreet,
  parseHouseNumber,
  renderReport,
  summariseSegments,
  type Address,
  type OverpassAddressElement,
} from './block-numbers.ts';
import type { SegmentCollection } from './segments.ts';

// An east-west block 200 m long at latitude 34.18: 0.001 degree of longitude is about 92 m there.
const LAT = 34.18;
const LON = -118.3;
const seg = (id: string, street: string, lat: number): SegmentCollection['features'][number] => ({
  type: 'Feature',
  properties: { segment_id: id, street, from_street: null, to_street: null, city_id: 'burbank' },
  geometry: { type: 'LineString', coordinates: [[LON, lat], [LON + 0.002, lat]] },
});
const OLIVE = seg('s-olive', 'West Olive Avenue', LAT);
// 0.0001 degree of latitude is about 11.1 m.
const addr = (n: number, street: string, dLat: number, dLon = 0.001): Address => ({ housenumber: n, street, lat: LAT + dLat, lon: LON + dLon });

describe('normaliseStreet', () => {
  it('ignores case, spacing and trailing periods only', () => {
    expect(normaliseStreet('  West  Olive Avenue. ')).toBe(normaliseStreet('west olive avenue'));
  });
  it('keeps different streets different, and does not expand abbreviations', () => {
    expect(normaliseStreet('West Olive Avenue')).not.toBe(normaliseStreet('East Olive Avenue'));
    expect(normaliseStreet('W Olive Ave')).not.toBe(normaliseStreet('West Olive Avenue'));
  });
});

describe('parseHouseNumber', () => {
  it('reads a plain number, with surrounding space or a unit letter', () => {
    expect(parseHouseNumber('1204')).toBe(1204);
    expect(parseHouseNumber(' 1204 ')).toBe(1204);
    expect(parseHouseNumber('1204A')).toBe(1204);
  });
  it('refuses ranges, lists, fractions, zero and text rather than guess', () => {
    for (const v of ['1200-1210', '1200;1202', '12 1/2', '0', 'abc', '', '1200 Unit 4']) expect(parseHouseNumber(v)).toBeNull();
  });
});

describe('hundredOf and blockNumberFor', () => {
  it('rounds down to the hundred', () => {
    expect(hundredOf(1204)).toBe(1200);
    expect(hundredOf(1299)).toBe(1200);
    expect(hundredOf(99)).toBe(0);
  });
  it('gives a block number for two or more addresses in one hundred', () => {
    expect(blockNumberFor([1204, 1230])).toBe(1200);
    expect(blockNumberFor([1204, 1204])).toBe(1200);
  });
  it('gives nothing for fewer than two addresses', () => {
    expect(blockNumberFor([])).toBeNull();
    expect(blockNumberFor([1204])).toBeNull();
  });
  it('gives nothing when the addresses span different hundreds, even by one', () => {
    expect(blockNumberFor([1298, 1302])).toBeNull();
  });
});

describe('distanceToLineM', () => {
  it('measures to the nearest point of the line in metres', () => {
    expect(distanceToLineM([LON + 0.001, LAT + 0.0003], OLIVE.geometry.coordinates)).toBeCloseTo(33.4, 0);
  });
  it('measures to the end when the point is past it', () => {
    const d = distanceToLineM([LON + 0.003, LAT], OLIVE.geometry.coordinates);
    expect(d).toBeCloseTo(92.3, 0);
  });
});

describe('elementsToAddresses', () => {
  it('takes nodes, and building ways by their centre, and skips anything without a usable number or street', () => {
    const elements: OverpassAddressElement[] = [
      { type: 'node', id: 1, lat: LAT, lon: LON, tags: { 'addr:housenumber': '1200', 'addr:street': 'West Olive Avenue' } },
      { type: 'way', id: 2, center: { lat: LAT, lon: LON + 0.001 }, tags: { 'addr:housenumber': '1204', 'addr:street': 'West Olive Avenue' } },
      { type: 'node', id: 3, lat: LAT, lon: LON, tags: { 'addr:housenumber': '12-14', 'addr:street': 'West Olive Avenue' } },
      { type: 'node', id: 4, lat: LAT, lon: LON, tags: { 'addr:housenumber': '12' } },
      { type: 'way', id: 5, tags: { 'addr:housenumber': '14', 'addr:street': 'X' } },
    ];
    expect(elementsToAddresses(elements)).toEqual([
      { housenumber: 1200, street: 'West Olive Avenue', lat: LAT, lon: LON },
      { housenumber: 1204, street: 'West Olive Avenue', lat: LAT, lon: LON + 0.001 },
    ]);
  });
});

describe('assignAddresses', () => {
  const other = seg('s-olive-2', 'West Olive Avenue', LAT + 0.0003); // about 33 m north
  it('assigns an address to the segment with the same street within 40 m', () => {
    const map = assignAddresses([addr(1200, 'West Olive Avenue', 0.00005)], [OLIVE]);
    expect(map.get('s-olive')).toEqual([1200]);
  });
  it('ignores an address on a different street even when it is next to the segment', () => {
    expect(assignAddresses([addr(1200, 'North Pass Avenue', 0)], [OLIVE]).size).toBe(0);
  });
  it('ignores an address more than 40 m away', () => {
    expect(assignAddresses([addr(1200, 'West Olive Avenue', 0.0004)], [OLIVE]).size).toBe(0); // about 44 m
  });
  it('assigns to the nearest of two same-street segments', () => {
    const map = assignAddresses([addr(1200, 'West Olive Avenue', 0.00005), addr(1300, 'West Olive Avenue', 0.00028)], [OLIVE, other]);
    expect(map.get('s-olive')).toEqual([1200]);
    expect(map.get('s-olive-2')).toEqual([1300]);
  });
  it('matches the street ignoring case and spacing', () => {
    const map = assignAddresses([addr(1200, 'west  olive avenue', 0)], [OLIVE]);
    expect(map.get('s-olive')).toEqual([1200]);
  });
});

describe('summariseSegments', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const found = new Map<string, number[]>([
    ['a', [1230, 1204, 1218]],
    ['b', [1204]],
    ['c', [1298, 1302]],
  ]);
  const rows = summariseSegments(ids, found);
  it('numbers a block with two or more addresses in one hundred, with the lowest and highest', () => {
    expect(rows[0]).toEqual({ segment_id: 'a', block_number: 1200, low_address: 1204, high_address: 1230, source: 'osm' });
  });
  it('leaves block_number empty for one address, but records what was found', () => {
    expect(rows[1]).toEqual({ segment_id: 'b', block_number: null, low_address: 1204, high_address: 1204, source: 'osm' });
  });
  it('leaves block_number empty for mixed hundreds', () => {
    expect(rows[2]).toEqual({ segment_id: 'c', block_number: null, low_address: 1298, high_address: 1302, source: 'osm' });
  });
  it('writes an empty row for a segment with no address', () => {
    expect(rows[3]).toEqual({ segment_id: 'd', block_number: null, low_address: null, high_address: null, source: 'osm' });
  });
});

describe('mergeBlockRows', () => {
  const manual: BlockRow = { segment_id: 'a', block_number: 500, low_address: null, high_address: null, source: 'manual' };
  const oldOsm: BlockRow = { segment_id: 'b', block_number: 100, low_address: 101, high_address: 150, source: 'osm' };
  const fresh: BlockRow[] = [
    { segment_id: 'a', block_number: 1200, low_address: 1204, high_address: 1230, source: 'osm' },
    { segment_id: 'b', block_number: null, low_address: null, high_address: null, source: 'osm' },
    { segment_id: 'c', block_number: 300, low_address: 301, high_address: 340, source: 'osm' },
  ];
  const merged = mergeBlockRows([manual, oldOsm], fresh);
  it('never overwrites a manual row, even when the new run has a number', () => {
    expect(merged.find((r) => r.segment_id === 'a')).toEqual(manual);
  });
  it('replaces an old osm row with the new result', () => {
    expect(merged.find((r) => r.segment_id === 'b')?.block_number).toBeNull();
  });
  it('adds new segments and sorts by segment_id', () => {
    expect(merged.map((r) => r.segment_id)).toEqual(['a', 'b', 'c']);
  });
  it('keeps a manual row whose segment is not in the new run', () => {
    const stray: BlockRow = { segment_id: 'z', block_number: 900, low_address: null, high_address: null, source: 'manual' };
    expect(mergeBlockRows([stray], fresh).some((r) => r.segment_id === 'z')).toBe(true);
  });
});

describe('renderReport', () => {
  const rows: BlockRow[] = [
    { segment_id: 'a', block_number: 1200, low_address: 1204, high_address: 1230, source: 'osm' },
    { segment_id: 'b', block_number: null, low_address: 1204, high_address: 1204, source: 'osm' },
    { segment_id: 'c', block_number: null, low_address: 1298, high_address: 1302, source: 'osm' },
    { segment_id: 'd', block_number: null, low_address: null, high_address: null, source: 'osm' },
    { segment_id: 'e', block_number: 700, low_address: null, high_address: null, source: 'manual' },
  ];
  const streets = new Map([['a', 'A St'], ['b', 'B St'], ['c', 'C St'], ['d', 'D St'], ['e', 'E St']]);
  const md = renderReport('burbank', rows, streets);
  it('counts numbered blocks and blocks needing hand entry', () => {
    expect(md).toContain('Blocks numbered: 2 of 5');
    expect(md).toContain('Blocks needing hand entry: 3');
  });
  it('lists each block needing entry with its street and the reason', () => {
    expect(md).toMatch(/b.*B St.*only 1 address/);
    expect(md).toMatch(/c.*C St.*different hundreds/);
    expect(md).toMatch(/d.*D St.*no address/);
    expect(md).not.toMatch(/\| a \|/);
    expect(md).not.toMatch(/\| e \|/);
  });
});
