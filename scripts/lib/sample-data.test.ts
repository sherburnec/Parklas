import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLayers, parseRuleRows, type RuleRow, type SegmentCollection } from './build.ts';
import { cellOf, generateSampleRows, rowsToCsv } from './sample-data.ts';

// A 60 x 60 street grid over Burbank's extent: alternating east-west and north-south blocks.
function gridSegments(): SegmentCollection {
  const features: SegmentCollection['features'] = [];
  const x0 = -118.368;
  const y0 = 34.145;
  const dx = 0.0016;
  const dy = 0.00125;
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 60; j++) {
      const x = x0 + i * dx;
      const y = y0 + j * dy;
      const eastWest = (i + j) % 2 === 0;
      features.push({
        type: 'Feature',
        properties: { segment_id: `t-${i}-${j}`, street: 'Test St', from_street: null, to_street: null, city_id: 't' },
        geometry: {
          type: 'LineString',
          coordinates: eastWest ? [[x, y], [x + dx * 0.8, y]] : [[x, y], [x, y + dy * 0.8]],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const segments = gridSegments();
const byId = new Map(segments.features.map((f) => [f.properties.segment_id, f]));
const SEED = 7;

function distinctCells(rows: RuleRow[], layer: RuleRow['layer'], segs: SegmentCollection): number {
  const lookup = new Map(segs.features.map((f) => [f.properties.segment_id, f]));
  return new Set(rows.filter((r) => r.layer === layer).map((r) => cellOf(lookup.get(r.segment_id)!, segs, 3))).size;
}

describe('generateSampleRows', () => {
  const rows = generateSampleRows(segments, SEED);

  it('is repeatable for a seed and differs for another seed', () => {
    expect(generateSampleRows(segments, SEED)).toEqual(rows);
    expect(generateSampleRows(segments, SEED + 1)).not.toEqual(rows);
  });

  it('maps about 1 in 15 segments, never the whole city', () => {
    const mapped = new Set(rows.map((r) => r.segment_id)).size;
    expect(mapped).toBeGreaterThan(segments.features.length / 20);
    expect(mapped).toBeLessThan(segments.features.length / 12);
  });

  it('spreads rows over the whole city, not one cluster', () => {
    const cells = new Set(rows.map((r) => cellOf(byId.get(r.segment_id)!, segments, 3)));
    expect(cells.size).toBe(9);
  });

  it('only uses the sides L and R, and the build script accepts every row', () => {
    expect(new Set(rows.map((r) => r.side))).toEqual(new Set(['L', 'R']));
    expect(() => buildLayers(segments, rows, 't')).not.toThrow();
  });

  it('covers every layer in at least 4 parts of the city', () => {
    for (const layer of ['sweeping', 'timed_parking', 'restrictions', 'curb_color'] as const) {
      expect(distinctCells(rows, layer, segments), layer).toBeGreaterThanOrEqual(4);
    }
  });

  it('fills only the columns that belong to each layer', () => {
    for (const r of rows) {
      expect(r.type !== null, 'type').toBe(r.layer === 'restrictions');
      expect(r.limit_minutes !== null, 'limit').toBe(r.layer === 'timed_parking');
      expect(r.color_key !== null, 'color').toBe(r.layer === 'curb_color');
      if (r.permit_code !== null) expect(['timed_parking', 'restrictions']).toContain(r.layer);
    }
  });

  it('uses all three restriction types, permit codes, and several limits', () => {
    const restrictions = rows.filter((r) => r.layer === 'restrictions');
    expect(new Set(restrictions.map((r) => r.type))).toEqual(new Set(['no_parking', 'no_standing', 'no_stopping']));
    expect(restrictions.some((r) => r.permit_code !== null)).toBe(true);
    expect(rows.every((r) => r.permit_code === null || r.permit_code.startsWith('DEMO-'))).toBe(true);
    const limits = new Set(rows.filter((r) => r.layer === 'timed_parking').map((r) => r.limit_minutes));
    expect(limits.size).toBeGreaterThanOrEqual(3);
  });

  it('mixes schedules: null, day/hour windows, midnight crossing and weeks of month', () => {
    type Window = { days: string[]; start: string; end: string; weeks_of_month?: number[] };
    const windows = rows.flatMap((r) => (r.schedule === null ? [] : (r.schedule as { windows: Window[] }).windows));
    expect(rows.some((r) => r.schedule === null)).toBe(true);
    expect(windows.some((w) => w.start < w.end && !w.weeks_of_month)).toBe(true);
    expect(windows.some((w) => w.end < w.start)).toBe(true);
    const weekly = rows.filter((r) => r.schedule !== null && (r.schedule as { windows: Window[] }).windows.some((w) => w.weeks_of_month));
    expect(weekly.length).toBeGreaterThan(0);
    expect(weekly.length).toBeLessThan(rows.length / 4); // "a few"
  });
});

type SweepWindow = { days: string[]; start: string; end: string; weeks_of_month?: number[] };
const windowsOf = (r: RuleRow): SweepWindow[] => (r.schedule === null ? [] : (r.schedule as { windows: SweepWindow[] }).windows);

/** Sweeping rows grouped by segment; segments with a row on each side are the "both sides" streets (TD-4). */
function bothSidesSweeping(rows: RuleRow[]): Map<string, RuleRow[]> {
  const bySegment = new Map<string, RuleRow[]>();
  for (const r of rows.filter((x) => x.layer === 'sweeping')) bySegment.set(r.segment_id, [...(bySegment.get(r.segment_id) ?? []), r]);
  return new Map([...bySegment].filter(([, rs]) => new Set(rs.map((r) => r.side)).size === 2));
}

describe('day-by-day sweeping (TD-4)', () => {
  const rows = generateSampleRows(segments, SEED);
  const both = bothSidesSweeping(rows);

  it('gives opposite sides of a block different single-day windows, without weeks of month', () => {
    expect(both.size).toBeGreaterThan(0);
    for (const rs of both.values()) {
      expect(rs).toHaveLength(2);
      const days = rs.map((r) => {
        const w = windowsOf(r);
        expect(w).toHaveLength(1);
        expect(w[0].days).toHaveLength(1);
        expect(w[0].weeks_of_month).toBeUndefined();
        return w[0].days[0];
      });
      expect(days[0]).not.toBe(days[1]);
    }
  });

  it('covers about half of the city, and every weekday has sweeping somewhere', () => {
    const cells = new Set([...both.keys()].map((id) => cellOf(byId.get(id)!, segments, 4)));
    expect(cells.size).toBeGreaterThanOrEqual(6);
    expect(cells.size).toBeLessThanOrEqual(10);
    const days = new Set(rows.filter((r) => r.layer === 'sweeping').flatMap((r) => windowsOf(r).flatMap((w) => w.days)));
    expect(days).toEqual(new Set(['mon', 'tue', 'wed', 'thu', 'fri']));
  });

  it('varies the days by area: each area uses its own pair of days', () => {
    const perCell = new Map<string, Set<string>>();
    for (const [id, rs] of both) {
      const key = cellOf(byId.get(id)!, segments, 4);
      perCell.set(key, new Set([...(perCell.get(key) ?? []), ...rs.flatMap((r) => windowsOf(r).flatMap((w) => w.days))]));
    }
    for (const days of perCell.values()) expect(days.size).toBe(2);
    expect(new Set([...perCell.values()].map((d) => [...d].sort().join('+'))).size).toBeGreaterThanOrEqual(4);
  });

  it('includes some windows starting at 08:30, ending at 10:30', () => {
    const starts = [...both.values()].flat().flatMap((r) => windowsOf(r));
    const half = starts.filter((w) => w.start === '08:30');
    expect(half.length).toBeGreaterThan(0);
    expect(half.every((w) => w.end === '10:30')).toBe(true);
    expect(half.length).toBeLessThan(starts.length / 2);
  });

  it('uses both sides of streets', () => {
    const sides = new Set([...both.values()].flat().map((r) => r.side));
    expect(sides).toEqual(new Set(['L', 'R']));
  });
});

describe('rowsToCsv', () => {
  it('round-trips through the build script parser', () => {
    const rows = generateSampleRows(segments, SEED);
    expect(parseRuleRows(rowsToCsv(rows))).toEqual(rows);
  });

  it('starts with the template header', () => {
    expect(rowsToCsv([]).split('\n')[0]).toBe('segment_id,side,layer,type,limit_minutes,permit_code,color_key,schedule');
  });
});

// The committed sample set, checked against the TD-2 "Done when" conditions.
describe('data/burbank-sample', () => {
  const root = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(root, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const csv = readFileSync(resolve(root, 'burbank-sample', 'rules.csv'), 'utf8');
  const rows = parseRuleRows(csv);

  it('is exactly what the generator writes (seed 20261023)', () => {
    expect(csv.replace(/\r\n/g, '\n')).toBe(rowsToCsv(generateSampleRows(real, 20261023)));
  });

  it('has rows for every rule layer in at least 4 distinct parts of the city', () => {
    for (const layer of ['sweeping', 'timed_parking', 'restrictions', 'curb_color'] as const) {
      expect(distinctCells(rows, layer, real), layer).toBeGreaterThanOrEqual(4);
    }
  });

  it('has sweeping on every weekday, with both sides of streets represented and some 08:30 starts', () => {
    const sweeping = rows.filter((r) => r.layer === 'sweeping');
    const days = new Set(sweeping.flatMap((r) => windowsOf(r).flatMap((w) => w.days)));
    expect(days).toEqual(new Set(['mon', 'tue', 'wed', 'thu', 'fri']));
    const both = bothSidesSweeping(rows);
    expect(both.size).toBeGreaterThan(0);
    expect(new Set([...both.values()].flat().map((r) => r.side))).toEqual(new Set(['L', 'R']));
    expect(sweeping.some((r) => windowsOf(r).some((w) => w.start === '08:30'))).toBe(true);
  });

  it('leaves more blocks unmapped than mapped', () => {
    const mapped = new Set(rows.map((r) => r.segment_id)).size;
    expect(mapped).toBeGreaterThan(0);
    expect(mapped).toBeLessThan(real.features.length - mapped);
  });
});
