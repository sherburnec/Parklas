import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLayers, parseRuleRows, type RuleRow, type SegmentCollection } from './build.ts';
import { cellOf, generateSampleRows, isCorner, permitCodeAt, rowsToCsv, SAMPLE_SEED, zoneAt, type PermitZoneCollection } from './sample-data.ts';
import { generateZoning } from './sample-zoning.ts';

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

// Timed parking spread (TD-5), checked against the real segments, zoning and permit zones.
describe('timed parking spread (TD-5)', () => {
  const data = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const permitZones = JSON.parse(readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
  const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
  const rows = generateSampleRows(real, SAMPLE_SEED, context);
  const timed = rows.filter((r) => r.layer === 'timed_parking');
  const realById = new Map(real.features.map((f) => [f.properties.segment_id, f]));
  const category = (id: string) => zoneAt(realById.get(id)!, context.zoning)?.properties.category;
  const commercialish = (id: string) => ['commercial', 'mixed_use'].includes(category(id) ?? '');

  it('is repeatable and leaves every other layer exactly as before', () => {
    expect(generateSampleRows(real, SAMPLE_SEED, context)).toEqual(rows);
    const others = (rs: RuleRow[]) => rs.filter((r) => r.layer !== 'timed_parking' && r.layer !== 'restrictions'); // restrictions: see TD-6
    expect(others(rows)).toEqual(others(generateSampleRows(real, SAMPLE_SEED)));
  });

  it('adds timed rows and keeps unmapped blocks far more common than mapped ones', () => {
    const before = generateSampleRows(real, SAMPLE_SEED);
    expect(timed.length).toBeGreaterThan(before.filter((r) => r.layer === 'timed_parking').length);
    const mapped = new Set(rows.map((r) => r.segment_id)).size;
    expect(mapped).toBeLessThan(real.features.length / 10);
  });

  it('uses 30, 60, 120, 180 and 240 minutes, each in at least 2 parts of the city', () => {
    for (const limit of [30, 60, 120, 180, 240]) {
      const cells = new Set(timed.filter((r) => r.limit_minutes === limit).map((r) => cellOf(realById.get(r.segment_id)!, real, 3)));
      expect(cells.size, `${limit} min`).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(timed.map((r) => r.limit_minutes))).toEqual(new Set([30, 60, 120, 180, 240]));
  });

  it('favours commercial and mixed-use zones over their share of the city', () => {
    const share = (ids: string[]) => ids.filter(commercialish).length / ids.length;
    const cityShare = share(real.features.map((f) => f.properties.segment_id));
    expect(share(timed.map((r) => r.segment_id))).toBeGreaterThan(cityShare * 1.5);
    expect(timed.some((r) => !commercialish(r.segment_id))).toBe(true); // still spread beyond them
  });

  it('gives most rows a schedule, a few none, and includes Mon-Sat 08:00-18:00', () => {
    const none = timed.filter((r) => r.schedule === null).length;
    expect(none).toBeGreaterThan(0);
    expect(none).toBeLessThan(timed.length / 4);
    const monSat = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    expect(timed.some((r) => windowsOf(r).some((w) => w.start === '08:00' && w.end === '18:00' && w.days.join() === monSat.join()))).toBe(true);
  });

  it('puts some timed rows on a side that also has sweeping', () => {
    const swept = new Set(rows.filter((r) => r.layer === 'sweeping').map((r) => `${r.segment_id}|${r.side}`));
    expect(timed.filter((r) => swept.has(`${r.segment_id}|${r.side}`)).length).toBeGreaterThanOrEqual(5);
  });

  it('adds DEMO- permit codes to a few rows inside the matching permit zone', () => {
    const inZone = timed.filter((r) => r.permit_code !== null && permitCodeAt(realById.get(r.segment_id)!, permitZones) === r.permit_code);
    expect(inZone.length).toBeGreaterThanOrEqual(3);
    expect(inZone.length).toBeLessThan(timed.length / 4); // "a few"
    expect(new Set(inZone.map((r) => r.permit_code)).size).toBeGreaterThanOrEqual(2);
  });

  it('gives every coded timed row the code of the permit zone its block lies in (TD-2 rows updated)', () => {
    const coded = timed.filter((r) => r.permit_code !== null);
    expect(coded.length).toBeGreaterThan(0);
    for (const r of coded) expect(permitCodeAt(realById.get(r.segment_id)!, permitZones), r.segment_id).toBe(r.permit_code);
  });

  it('writes no duplicate (segment, side) timed rows', () => {
    expect(new Set(timed.map((r) => `${r.segment_id}|${r.side}`)).size).toBe(timed.length);
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

// Restrictions spread (task TD-6): the five kinds of restriction, across the city.
describe('restrictions spread (TD-6)', () => {
  const data = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const permitZones = JSON.parse(readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
  const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
  const rows = generateSampleRows(real, SAMPLE_SEED, context);
  const base = generateSampleRows(real, SAMPLE_SEED);
  const restrictions = rows.filter((r) => r.layer === 'restrictions');
  const byId = new Map(real.features.map((f) => [f.properties.segment_id, f]));

  const same = (a: RuleRow, b: RuleRow) => JSON.stringify(a) === JSON.stringify(b);
  const inBase = (r: RuleRow) => base.some((b) => same(b, r));
  const kindOf = (r: RuleRow) =>
    r.type === 'no_stopping' ? 'no_stopping'
      : r.type === 'no_standing' ? 'no_standing'
        : r.permit_code !== null ? 'permit_only'
          : r.schedule !== null ? 'no_parking_timed'
            : 'no_parking_anytime';
  const cellsOf = (kind: string) =>
    new Set(restrictions.filter((r) => kindOf(r) === kind).map((r) => cellOf(byId.get(r.segment_id)!, real, 3)));

  it('is repeatable, keeps the earlier restriction rows and leaves other layers alone', () => {
    expect(generateSampleRows(real, SAMPLE_SEED, context)).toEqual(rows);
    const old = base.filter((r) => r.layer === 'restrictions');
    expect(restrictions.length).toBeGreaterThan(old.length);
    const noCode = (r: RuleRow) => JSON.stringify({ ...r, permit_code: null });
    expect(old.every((r) => restrictions.some((x) => noCode(x) === noCode(r)))).toBe(true); // only the code may change, see below
  });

  it('has each of the five kinds in at least 2 separate parts of the city', () => {
    for (const kind of ['permit_only', 'no_parking_timed', 'no_parking_anytime', 'no_stopping', 'no_standing']) {
      expect(cellsOf(kind).size, kind).toBeGreaterThanOrEqual(2);
    }
  });

  it('puts permit-only rows inside DEMO- permit zones with that zone code, in at least 2 zones', () => {
    const matching = restrictions.filter((r) => r.permit_code !== null && permitCodeAt(byId.get(r.segment_id)!, permitZones) === r.permit_code);
    expect(matching.length).toBeGreaterThanOrEqual(10);
    expect(new Set(matching.map((r) => r.permit_code)).size).toBeGreaterThanOrEqual(2);
    const added = restrictions.filter((r) => !inBase(r));
    for (const r of added.filter((x) => x.permit_code !== null)) {
      expect(permitCodeAt(byId.get(r.segment_id)!, permitZones), r.segment_id).toBe(r.permit_code);
    }
  });

  it('puts the added no stopping rows on short blocks that end at a cross street', () => {
    const added = restrictions.filter((r) => r.type === 'no_stopping' && !inBase(r));
    expect(added.length).toBeGreaterThanOrEqual(5);
    for (const r of added) expect(isCorner(byId.get(r.segment_id)!, real), r.segment_id).toBe(true);
  });

  it('adds restrictions to sides that already have timed parking', () => {
    const timed = new Set(rows.filter((r) => r.layer === 'timed_parking').map((r) => `${r.segment_id}|${r.side}`));
    const onTimed = (rs: RuleRow[]) => rs.filter((r) => r.layer === 'restrictions' && timed.has(`${r.segment_id}|${r.side}`)).length;
    expect(onTimed(rows)).toBeGreaterThan(onTimed(base) + 5);
  });

  // Exemption rows: a scheduled no-parking row (weekdays 07:00-09:00, which no earlier step writes with a code) whose
  // permit_code is the DEMO- zone it sits in, meaning holders of that zone's permit are exempt.
  const isExempt = (r: RuleRow) =>
    r.type === 'no_parking' && r.permit_code !== null && windowsOf(r).some((w) => w.start === '07:00' && w.end === '09:00');

  it('gives a few other no-parking rows a zone code as an exemption, and leaves most rows unmarked', () => {
    const exempt = restrictions.filter(isExempt);
    expect(exempt.length).toBeGreaterThanOrEqual(8);
    expect(new Set(exempt.map((r) => r.permit_code)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(exempt.map((r) => cellOf(byId.get(r.segment_id)!, real, 3))).size).toBeGreaterThanOrEqual(2);
    for (const r of exempt) expect(permitCodeAt(byId.get(r.segment_id)!, permitZones), r.segment_id).toBe(r.permit_code);
    expect(exempt.length).toBeLessThan(restrictions.length / 8);
    expect(restrictions.filter((r) => r.permit_code === null).length).toBeGreaterThan(restrictions.length / 2);
  });

  it('gives every coded restriction row the code of the permit zone its block lies in (TD-2 rows updated)', () => {
    const coded = restrictions.filter((r) => r.permit_code !== null);
    expect(coded.length).toBeGreaterThan(0);
    for (const r of coded) expect(permitCodeAt(byId.get(r.segment_id)!, permitZones), r.segment_id).toBe(r.permit_code);
    // The TD-2 rows with a code outside their zone were updated in place: same rows, only the code differs.
    const zoneOf = (r: RuleRow) => permitCodeAt(byId.get(r.segment_id)!, permitZones);
    const wrong = base.filter((r) => r.layer === 'restrictions' && r.permit_code !== null && zoneOf(r) !== r.permit_code);
    expect(wrong).toHaveLength(19);
    for (const r of wrong) {
      expect(restrictions.some((x) => same(x, { ...r, permit_code: zoneOf(r) })), r.segment_id).toBe(true);
    }
  });

  it('writes no duplicate (segment, side) restriction rows and keeps unmapped blocks far more common', () => {
    expect(new Set(restrictions.map((r) => `${r.segment_id}|${r.side}`)).size).toBe(restrictions.length);
    expect(new Set(rows.map((r) => r.segment_id)).size).toBeLessThan(real.features.length / 10);
  });
});

// The committed sample set, checked against the TD-2 "Done when" conditions.
describe('data/burbank-sample', () => {
  const root = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(root, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const csv = readFileSync(resolve(root, 'burbank-sample', 'rules.csv'), 'utf8');
  const rows = parseRuleRows(csv);

  it('is exactly what the generator writes (seed 20261023)', () => {
    const permitZones = JSON.parse(readFileSync(resolve(root, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
    const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
    expect(csv.replace(/\r\n/g, '\n')).toBe(rowsToCsv(generateSampleRows(real, 20261023, context)));
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
