import { describe, expect, it } from 'vitest';
import { BLOCK_COLUMNS, buildBlocks, parseBlockRows, serializeBlockRows, type BlockRow } from './blocks.ts';

const HEADER = BLOCK_COLUMNS.join(',');

describe('parseBlockRows', () => {
  it('reads rows, turning empty cells into null and numbers into numbers', () => {
    const rows = parseBlockRows(`${HEADER}\na,1200,1204,1230,osm\nb,,,,osm\nc,700,,,manual\n`);
    expect(rows).toEqual([
      { segment_id: 'a', block_number: 1200, low_address: 1204, high_address: 1230, source: 'osm' },
      { segment_id: 'b', block_number: null, low_address: null, high_address: null, source: 'osm' },
      { segment_id: 'c', block_number: 700, low_address: null, high_address: null, source: 'manual' },
    ]);
  });
  it('skips blank lines and returns nothing for empty text', () => {
    expect(parseBlockRows('')).toEqual([]);
    expect(parseBlockRows(`${HEADER}\n\na,100,101,150,osm\n`)).toHaveLength(1);
  });
  it('is not fussy about column order', () => {
    expect(parseBlockRows('source,segment_id,block_number\nmanual,a,300')).toEqual([
      { segment_id: 'a', block_number: 300, low_address: null, high_address: null, source: 'manual' },
    ]);
  });
});

describe('serializeBlockRows', () => {
  it('writes the header and one line per row, and reads back the same', () => {
    const rows: BlockRow[] = [
      { segment_id: 'a', block_number: 1200, low_address: 1204, high_address: 1230, source: 'osm' },
      { segment_id: 'b', block_number: null, low_address: null, high_address: null, source: 'manual' },
    ];
    const text = serializeBlockRows(rows);
    expect(text.split('\n')[0]).toBe(HEADER);
    expect(text).toContain('b,,,,manual');
    expect(parseBlockRows(text)).toEqual(rows);
  });
});

describe('buildBlocks', () => {
  const rows: BlockRow[] = [
    { segment_id: 'a', block_number: 1200, low_address: 1204, high_address: 1230, source: 'osm' },
    { segment_id: 'b', block_number: null, low_address: null, high_address: null, source: 'osm' },
  ];
  it('maps segment_id to block_number, with null for a row that has none', () => {
    expect(buildBlocks(rows, 'burbank')).toEqual({ city_id: 'burbank', blocks: { a: 1200, b: null } });
  });
  it('gives an empty map for no rows', () => {
    expect(buildBlocks([], 'burbank')).toEqual({ city_id: 'burbank', blocks: {} });
  });
});
