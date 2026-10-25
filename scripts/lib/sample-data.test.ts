import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLayers, parseRuleRows, type RuleRow, type SegmentCollection } from './build.ts';
import { generatePermitZones, permitZonesToJson } from './sample-permit-zones.ts';
import { cellOf, CURB_COLORS, curbColorsToJson, generateSampleRows, isCorner, permitCodeAt, rowsToCsv, SAMPLE_SEED, TARGET_MAPPED_SHARE, zoneAt, type PermitZoneCollection } from './sample-data.ts';
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

// The earlier spreads (TD-5 to TD-8) are checked on the rows before the TD-2.2 top-up (target share null), so they test their own step.
// Timed parking spread (TD-5), checked against the real segments, zoning and permit zones.
describe('timed parking spread (TD-5)', () => {
  const data = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const permitZones = JSON.parse(readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
  const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
  const rows = generateSampleRows(real, SAMPLE_SEED, context, null);
  const timed = rows.filter((r) => r.layer === 'timed_parking');
  const realById = new Map(real.features.map((f) => [f.properties.segment_id, f]));
  const category = (id: string) => zoneAt(realById.get(id)!, context.zoning)?.properties.category;
  const commercialish = (id: string) => ['commercial', 'mixed_use'].includes(category(id) ?? '');

  it('is repeatable and leaves every other layer exactly as before', () => {
    expect(generateSampleRows(real, SAMPLE_SEED, context, null)).toEqual(rows);
    const others = (rs: RuleRow[]) => rs.filter((r) => r.layer !== 'timed_parking' && r.layer !== 'restrictions' && r.layer !== 'curb_color'); // restrictions: see TD-6, curb_color: see TD-7
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
    const inZone = timed.filter((r) => r.permit_code !== null && permitCodeAt(realById.get(r.segment_id)!, permitZones, r.side) === r.permit_code);
    expect(inZone.length).toBeGreaterThanOrEqual(3);
    expect(inZone.length).toBeLessThan(timed.length / 4); // "a few"
    expect(new Set(inZone.map((r) => r.permit_code)).size).toBeGreaterThanOrEqual(2);
  });

  it('gives every coded timed row the code of the permit zone its block lies in (TD-2 rows updated)', () => {
    const coded = timed.filter((r) => r.permit_code !== null);
    expect(coded.length).toBeGreaterThan(0);
    for (const r of coded) expect(permitCodeAt(realById.get(r.segment_id)!, permitZones, r.side), r.segment_id).toBe(r.permit_code);
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
    expect(rowsToCsv([]).split('\n')[0]).toBe('segment_id,side,layer,type,limit_minutes,permit_code,permit_mode,color_key,schedule');
  });
});

// Restrictions spread (task TD-6): the five kinds of restriction, across the city.
describe('restrictions spread (TD-6)', () => {
  const data = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const permitZones = JSON.parse(readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
  const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
  const rows = generateSampleRows(real, SAMPLE_SEED, context, null);
  const base = generateSampleRows(real, SAMPLE_SEED);
  const restrictions = rows.filter((r) => r.layer === 'restrictions');
  const byId = new Map(real.features.map((f) => [f.properties.segment_id, f]));

  const same = (a: RuleRow, b: RuleRow) => JSON.stringify(a) === JSON.stringify(b);
  const inBase = (r: RuleRow) => base.some((b) => same(b, r));
  const kindOf = (r: RuleRow) =>
    r.type === 'no_stopping' ? 'no_stopping'
      : r.type === 'no_standing' ? 'no_standing'
        : r.permit_mode === 'required' ? 'permit_only'
          : r.schedule !== null ? 'no_parking_timed'
            : 'no_parking_anytime';
  const cellsOf = (kind: string) =>
    new Set(restrictions.filter((r) => kindOf(r) === kind).map((r) => cellOf(byId.get(r.segment_id)!, real, 3)));

  it('is repeatable, keeps the earlier restriction rows and leaves other layers alone', () => {
    expect(generateSampleRows(real, SAMPLE_SEED, context, null)).toEqual(rows);
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

  it('marks permit-only rows "required", and gives permit_mode to no other kind of row', () => {
    expect(restrictions.filter((r) => r.permit_mode === 'required').length).toBeGreaterThanOrEqual(10);
    for (const r of rows) {
      if (r.permit_mode === null || r.permit_mode === undefined) continue;
      expect(r.layer, 'layer').toBe('restrictions');
      expect(r.type, 'type').toBe('no_parking');
      expect(r.permit_code, 'code').not.toBeNull();
    }
    // Rows with a code and no "required" are exempt rows, and they exist too (scheduled and always-on both allowed).
    expect(restrictions.some((r) => r.permit_code !== null && r.permit_mode !== 'required')).toBe(true);
  });

  it('puts permit-only rows inside DEMO- permit zones with that zone code, in at least 2 zones', () => {
    const matching = restrictions.filter((r) => r.permit_mode === 'required' &&permitCodeAt(byId.get(r.segment_id)!, permitZones, r.side) === r.permit_code);
    expect(matching.length).toBeGreaterThanOrEqual(10);
    expect(new Set(matching.map((r) => r.permit_code)).size).toBeGreaterThanOrEqual(2);
    const added = restrictions.filter((r) => !inBase(r));
    for (const r of added.filter((x) => x.permit_code !== null)) {
      expect(permitCodeAt(byId.get(r.segment_id)!, permitZones, r.side), r.segment_id).toBe(r.permit_code);
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
    for (const r of exempt) expect(permitCodeAt(byId.get(r.segment_id)!, permitZones, r.side), r.segment_id).toBe(r.permit_code);
    expect(exempt.length).toBeLessThan(restrictions.length / 8);
    expect(restrictions.filter((r) => r.permit_code === null).length).toBeGreaterThan(restrictions.length / 2);
  });

  it('gives every coded restriction row the code of the permit zone its block lies in (TD-2 rows updated)', () => {
    const coded = restrictions.filter((r) => r.permit_code !== null);
    expect(coded.length).toBeGreaterThan(0);
    for (const r of coded) expect(permitCodeAt(byId.get(r.segment_id)!, permitZones, r.side), r.segment_id).toBe(r.permit_code);
    // The TD-2 rows with a code outside their zone were updated in place: same rows, only the code differs.
    const zoneOf = (r: RuleRow) => permitCodeAt(byId.get(r.segment_id)!, permitZones, r.side);
    const wrong = base.filter((r) => r.layer === 'restrictions' && r.permit_code !== null && zoneOf(r) !== r.permit_code);
    expect(wrong.length).toBeGreaterThan(0);
    for (const r of wrong) {
      expect(restrictions.some((x) => same(x, { ...r, permit_code: zoneOf(r) })), r.segment_id).toBe(true);
    }
  });

  it('writes no duplicate (segment, side) restriction rows and keeps unmapped blocks far more common', () => {
    expect(new Set(restrictions.map((r) => `${r.segment_id}|${r.side}`)).size).toBe(restrictions.length);
    expect(new Set(rows.map((r) => r.segment_id)).size).toBeLessThan(real.features.length / 10);
  });
});

// Permit zones and the rules that use them (task TD-8).
describe('permit codes against the permit zones (TD-8)', () => {
  const data = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const zoning = generateZoning(real, 'burbank-sample');
  const permitZones = generatePermitZones(real, zoning, 'burbank-sample');
  const rows = generateSampleRows(real, SAMPLE_SEED, { zoning, permitZones }, null);
  const byId = new Map(real.features.map((f) => [f.properties.segment_id, f]));
  const coded = rows.filter((r) => r.permit_code !== null);

  it('matches the permit-zones.geojson file the generator writes', () => {
    const onDisk = readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8');
    expect(onDisk.replace(/\r\n/g, '\n')).toBe(permitZonesToJson(permitZones));
  });

  it('gives every DEMO- code in the rules a zone, and every zone at least one rule', () => {
    const zoneCodes = new Set(permitZones.features.map((f) => f.properties.permit_code));
    expect(zoneCodes.size).toBe(8);
    for (const r of coded) expect(zoneCodes.has(r.permit_code!), `${r.segment_id} ${r.permit_code}`).toBe(true);
    for (const code of zoneCodes) expect(coded.some((r) => r.permit_code === code), code).toBe(true);
  });

  it('gives every coded row the code of the zone its own side lies in', () => {
    for (const r of coded) expect(permitCodeAt(byId.get(r.segment_id)!, permitZones, r.side), `${r.segment_id} ${r.side}`).toBe(r.permit_code);
  });

  it('never leaves a permit-only row without a code', () => {
    for (const r of rows.filter((x) => x.permit_mode !== null && x.permit_mode !== undefined)) expect(r.permit_code).not.toBeNull();
  });

  it('keeps the sweeping rows exactly as they were', () => {
    const sweeping = (rs: RuleRow[]) => rs.filter((r) => r.layer === 'sweeping');
    expect(sweeping(rows)).toEqual(sweeping(generateSampleRows(real, SAMPLE_SEED)));
  });
});

// Curb colors spread (task TD-7): the five colors of the sample config, placed across the city, mostly near corners.
describe('curb colors spread (TD-7)', () => {
  const data = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const permitZones = JSON.parse(readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
  const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
  const rows = generateSampleRows(real, SAMPLE_SEED, context, null);
  const base = generateSampleRows(real, SAMPLE_SEED);
  const colored = rows.filter((r) => r.layer === 'curb_color');
  const byId = new Map(real.features.map((f) => [f.properties.segment_id, f]));
  const same = (a: RuleRow, b: RuleRow) => JSON.stringify(a) === JSON.stringify(b);
  const added = colored.filter((r) => !base.some((b) => same(b, r)));
  const defaultOf = (key: string) => JSON.stringify(CURB_COLORS[key].default_schedule);

  it('defines red, yellow, white, green and blue, each with label, hex, time limit and default schedule', () => {
    expect(Object.keys(CURB_COLORS).sort()).toEqual(['blue', 'green', 'red', 'white', 'yellow']);
    for (const c of Object.values(CURB_COLORS)) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c).toHaveProperty('time_limit_minutes');
      expect(c).toHaveProperty('default_schedule');
    }
  });

  it('is repeatable, keeps every earlier curb color row and leaves other layers alone', () => {
    expect(generateSampleRows(real, SAMPLE_SEED, context, null)).toEqual(rows);
    const old = base.filter((r) => r.layer === 'curb_color');
    expect(added.length).toBeGreaterThan(0);
    expect(colored.length).toBe(old.length + added.length);
    expect(old.every((r) => colored.some((x) => same(x, r)))).toBe(true);
    // New rows go on the end, so no earlier row moves.
    expect(rows.slice(rows.length - added.length)).toEqual(added);
  });

  it('uses only colors from the config, and every color appears in at least 2 separate parts of the city', () => {
    for (const r of colored) expect(Object.keys(CURB_COLORS), r.segment_id).toContain(r.color_key);
    for (const key of Object.keys(CURB_COLORS)) {
      const cells = new Set(colored.filter((r) => r.color_key === key).map((r) => cellOf(byId.get(r.segment_id)!, real, 3)));
      expect(cells.size, key).toBeGreaterThanOrEqual(2);
    }
  });

  it('puts most of the added rows on corner blocks', () => {
    const corners = added.filter((r) => isCorner(byId.get(r.segment_id)!, real)).length;
    expect(corners / added.length).toBeGreaterThan(0.7);
    expect(corners).toBeLessThan(added.length); // a few sit mid-block
  });

  it('gives a few rows their own schedule that differs from the color default', () => {
    const own = colored.filter((r) => r.schedule !== null && JSON.stringify(r.schedule) !== defaultOf(r.color_key!));
    const addedOwn = added.filter((r) => own.includes(r));
    expect(addedOwn.length).toBeGreaterThanOrEqual(3);
    expect(new Set(addedOwn.map((r) => r.color_key)).size).toBeGreaterThanOrEqual(2);
    expect(addedOwn.length).toBeLessThan(added.length / 3); // "a few"
  });

  it('writes no duplicate (segment, side) curb color rows and keeps unmapped blocks far more common', () => {
    expect(new Set(colored.map((r) => `${r.segment_id}|${r.side}`)).size).toBe(colored.length);
    expect(new Set(rows.map((r) => r.segment_id)).size).toBeLessThan(real.features.length / 10);
  });

  it('writes a config file in the format of curb-colors-config.schema.json', () => {
    const json = JSON.parse(curbColorsToJson('burbank-sample')) as { city_id: string; colors: Record<string, unknown> };
    expect(json.city_id).toBe('burbank-sample');
    expect(json.colors).toEqual(CURB_COLORS);
  });
});

// Target share of mapped blocks (task TD-2.2): the generator tops mapped blocks up to a share set in docs/PLAN.md.
describe('target share of mapped blocks (TD-2.2)', () => {
  const data = resolve(import.meta.dirname, '..', '..', 'data');
  const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
  const permitZones = JSON.parse(readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
  const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
  const before = generateSampleRows(real, SAMPLE_SEED, context, null);
  const rows = generateSampleRows(real, SAMPLE_SEED, context);
  const added = rows.slice(before.length);
  const total = real.features.length;
  const share = (rs: RuleRow[]) => new Set(rs.map((r) => r.segment_id)).size / total;
  const byId = new Map(real.features.map((f) => [f.properties.segment_id, f]));

  it('takes its value from the TD-2.2 row of docs/PLAN.md', () => {
    const plan = readFileSync(resolve(import.meta.dirname, '..', '..', 'docs', 'PLAN.md'), 'utf8');
    const match = /\| TD-2\.2 [^\n]*Target share: \*\*(\d+(?:\.\d+)?)%\*\*/.exec(plan);
    expect(match, 'PLAN.md has a TD-2.2 row with "Target share: **NN%**"').not.toBeNull();
    expect(Number(match![1]) / 100).toBe(TARGET_MAPPED_SHARE);
  });

  it('brings the share of blocks with a rule up to the target and no further', () => {
    expect(share(before)).toBeLessThan(TARGET_MAPPED_SHARE);
    expect(share(rows)).toBeGreaterThanOrEqual(TARGET_MAPPED_SHARE);
    expect(share(rows)).toBeLessThan(TARGET_MAPPED_SHARE + 1 / total + 1e-9);
  });

  it('follows any other target, and adds nothing when the target is already met', () => {
    const half = generateSampleRows(real, SAMPLE_SEED, context, 0.5);
    expect(share(half)).toBeGreaterThanOrEqual(0.5);
    expect(share(half)).toBeLessThan(0.5 + 1 / total + 1e-9);
    expect(generateSampleRows(real, SAMPLE_SEED, context, 0.01)).toEqual(before);
  });

  it('is repeatable and keeps every earlier row exactly where it was', () => {
    expect(generateSampleRows(real, SAMPLE_SEED, context)).toEqual(rows);
    expect(rows.slice(0, before.length)).toEqual(before);
    expect(added.length).toBeGreaterThan(0);
  });

  it('puts new rows only on blocks that had none, and writes no duplicate side and layer', () => {
    const had = new Set(before.map((r) => r.segment_id));
    for (const r of added) expect(had.has(r.segment_id), r.segment_id).toBe(false);
    expect(new Set(rows.map((r) => `${r.segment_id}|${r.side}|${r.layer}`)).size).toBe(rows.length);
  });

  it('leaves most new blocks with a single rule, which is fine', () => {
    const perBlock = new Map<string, number>();
    for (const r of added) perBlock.set(r.segment_id, (perBlock.get(r.segment_id) ?? 0) + 1);
    const single = [...perBlock.values()].filter((n) => n === 1).length;
    expect(single / perBlock.size).toBeGreaterThan(0.5);
  });

  it('adds every rule layer, in all nine parts of the city', () => {
    for (const layer of ['sweeping', 'timed_parking', 'restrictions', 'curb_color'] as const) {
      expect(added.some((r) => r.layer === layer), layer).toBe(true);
    }
    expect(new Set(added.map((r) => cellOf(byId.get(r.segment_id)!, real, 3))).size).toBe(9);
  });

  it('keeps the day-by-day sweeping pattern: both sides, different single days, no weeks of month', () => {
    const sweeping = added.filter((r) => r.layer === 'sweeping');
    const bySegment = new Map<string, RuleRow[]>();
    for (const r of sweeping) bySegment.set(r.segment_id, [...(bySegment.get(r.segment_id) ?? []), r]);
    expect(bySegment.size).toBeGreaterThan(0);
    for (const rs of bySegment.values()) {
      expect(rs.map((r) => r.side).sort()).toEqual(['L', 'R']);
      const days = rs.map((r) => windowsOf(r).flatMap((w) => w.days).join());
      expect(days[0]).not.toBe(days[1]);
      for (const r of rs) expect(windowsOf(r).every((w) => w.days.length === 1 && !w.weeks_of_month)).toBe(true);
    }
  });

  it('writes valid rows: right columns per layer, a permit code only if it names the side\'s own zone', () => {
    for (const r of added) {
      expect(r.type !== null, 'type').toBe(r.layer === 'restrictions');
      expect(r.limit_minutes !== null, 'limit').toBe(r.layer === 'timed_parking');
      expect(r.color_key !== null, 'color').toBe(r.layer === 'curb_color');
      if (r.permit_code !== null) expect(permitCodeAt(byId.get(r.segment_id)!, permitZones, r.side)).toBe(r.permit_code);
      if (r.layer === 'curb_color') expect(Object.keys(CURB_COLORS)).toContain(r.color_key);
    }
    expect(() => buildLayers(real, rows, 'burbank-sample')).not.toThrow();
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

  it('writes curb-colors.json exactly as the generator does, and the rows use every color in it', () => {
    const config = readFileSync(resolve(root, 'burbank-sample', 'curb-colors.json'), 'utf8');
    expect(config.replace(/\r\n/g, '\n')).toBe(curbColorsToJson('burbank-sample'));
    const used = new Set(rows.filter((r) => r.layer === 'curb_color').map((r) => r.color_key));
    expect(used).toEqual(new Set(Object.keys(JSON.parse(config).colors)));
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

  it('maps the TD-2.2 target share of blocks (amended from "unmapped outnumber mapped")', () => {
    const mapped = new Set(rows.map((r) => r.segment_id)).size;
    expect(mapped / real.features.length).toBeGreaterThanOrEqual(TARGET_MAPPED_SHARE);
    expect(mapped).toBeLessThan(real.features.length); // still some blocks "not yet mapped"
  });
});
