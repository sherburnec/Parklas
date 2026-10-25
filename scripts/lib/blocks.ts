// blocks.csv rows and the blocks.json the page loads (task M5-5). Pure: no file I/O here.
import { BLOCK_COLUMNS, parseCsv } from './validate.ts';

export interface BlockRow {
  segment_id: string;
  /** A non-negative multiple of 100, or null when not known. */
  block_number: number | null;
  low_address: number | null;
  high_address: number | null;
  /** osm: written by extract-block-numbers. manual: typed by hand, never overwritten by the script. */
  source: 'osm' | 'manual';
}

export { BLOCK_COLUMNS };

export interface BlocksFile {
  city_id: string;
  blocks: Record<string, number | null>;
}


const num = (v: string | undefined): number | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : Number(t);
};

/** Reads blocks.csv. Cells are taken as they are; the validator reports bad values. */
export function parseBlockRows(text: string): BlockRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);
  return rows
    .slice(1)
    .filter((cells) => !(cells.length === 1 && cells[0].trim() === ''))
    .map((cells) => ({
      segment_id: (cells[at('segment_id')] ?? '').trim(),
      block_number: num(cells[at('block_number')]),
      low_address: num(cells[at('low_address')]),
      high_address: num(cells[at('high_address')]),
      source: (cells[at('source')] ?? '').trim() as BlockRow['source'],
    }));
}

export function serializeBlockRows(rows: BlockRow[]): string {
  const cell = (n: number | null) => (n === null ? '' : String(n));
  const lines = rows.map((r) => [r.segment_id, cell(r.block_number), cell(r.low_address), cell(r.high_address), r.source].join(','));
  return `${[BLOCK_COLUMNS.join(','), ...lines].join('\n')}\n`;
}

/** segment_id to block_number (or null), the file the loader reads. */
export function buildBlocks(rows: BlockRow[], cityId: string): BlocksFile {
  const blocks: Record<string, number | null> = {};
  for (const r of rows) blocks[r.segment_id] = r.block_number;
  return { city_id: cityId, blocks };
}
