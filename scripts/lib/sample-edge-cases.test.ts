import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { instantFor, isActive, nextChange } from '../../src/schedule-engine/index.ts';
import { buildLayers, parseRuleRows, type RuleRow, type SegmentCollection } from './build.ts';
import { addEdgeCases, edgeCasesToMarkdown, pickEdgeCases, type EdgeCase } from './sample-edge-cases.ts';
import { cellOf, CURB_COLORS, generateSampleRows, permitCodeAt, rowsToCsv, SAMPLE_SEED, type PermitZoneCollection } from './sample-data.ts';
import { generateZoning } from './sample-zoning.ts';
import type { TrimData } from './trim.ts';

const data = resolve(import.meta.dirname, '..', '..', 'data');
const real = JSON.parse(readFileSync(resolve(data, 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
const trim = JSON.parse(readFileSync(resolve(data, 'burbank', 'trim.json'), 'utf8')) as TrimData;
const permitZones = JSON.parse(readFileSync(resolve(data, 'burbank-sample', 'permit-zones.geojson'), 'utf8')) as PermitZoneCollection;
const context = { zoning: generateZoning(real, 'burbank-sample'), permitZones };
const base = generateSampleRows(real, SAMPLE_SEED, context);
const cases = pickEdgeCases(base, real, trim, SAMPLE_SEED);
const rows = addEdgeCases(base, cases);
const byId = new Map(real.features.map((f) => [f.properties.segment_id, f]));
const edgeRows = cases.flatMap((c) => c.rows);

type Window = { days: string[]; start: string; end: string; weeks_of_month?: number[] };
const windowsOf = (r: RuleRow): Window[] => (r.schedule === null ? [] : (r.schedule as { windows: Window[] }).windows);

/** The map layer a row is drawn in: the restrictions file is split by type (FR-7). */
const mapLayer = (r: RuleRow) => (r.layer === 'restrictions' && r.type !== 'no_parking' ? 'no_stopping_standing' : r.layer);

describe('pickEdgeCases', () => {
  it('is repeatable', () => {
    expect(pickEdgeCases(base, real, trim, SAMPLE_SEED)).toEqual(cases);
  });

  it('makes 3 stacked sides, 1 inner-facing side and 1 sliver', () => {
    expect(cases.filter((c) => c.kind === 'stack')).toHaveLength(3);
    expect(cases.filter((c) => c.kind === 'inner')).toHaveLength(1);
    expect(cases.filter((c) => c.kind === 'sliver')).toHaveLength(1);
  });

  it('stacks rules from 4 or more layers on each stacked side, in 3 different parts of the city and on 3 streets', () => {
    const stacks = cases.filter((c) => c.kind === 'stack');
    for (const c of stacks) expect(new Set(c.rows.map(mapLayer)).size, c.id).toBeGreaterThanOrEqual(4);
    const cells = stacks.map((c) => cellOf(byId.get(c.segment_id)!, real, 3).split(','));
    expect(new Set(cells.map(([col]) => col)).size).toBe(3);
    expect(new Set(cells.map(([, row]) => row)).size).toBe(3);
    expect(new Set(stacks.map((c) => byId.get(c.segment_id)!.properties.street)).size).toBe(3);
  });

  it('includes a 22:00-06:00 window, a Sunday-into-Monday window, a null schedule, an 08:30 start and one weeks [1, 3] row', () => {
    const windows = edgeRows.flatMap(windowsOf);
    expect(windows.some((w) => w.start === '22:00' && w.end === '06:00')).toBe(true);
    expect(windows.some((w) => w.days.length === 1 && w.days[0] === 'sun' && w.end < w.start)).toBe(true);
    expect(edgeRows.some((r) => r.schedule === null)).toBe(true);
    expect(windows.some((w) => w.start === '08:30')).toBe(true);
    const weekly = edgeRows.filter((r) => windowsOf(r).some((w) => w.weeks_of_month));
    expect(weekly).toHaveLength(1);
    expect(windowsOf(weekly[0])[0].weeks_of_month).toEqual([1, 3]);
  });

  it('gives the inner-facing case a rule on a side trim.json flags as inner, and nothing else on that side', () => {
    const c = cases.find((x) => x.kind === 'inner')!;
    const flags = trim.segments[c.segment_id];
    expect(c.side === 'L' ? flags.inner_L : flags.inner_R).toBe(true);
    expect(c.rows).toHaveLength(1);
    expect(base.some((r) => r.segment_id === c.segment_id && r.side === c.side)).toBe(false);
  });

  it('gives the sliver case a flagged sliver whose rule is the only one in its layer on that block', () => {
    const c = cases.find((x) => x.kind === 'sliver')!;
    expect(trim.segments[c.segment_id].sliver).toBe(true);
    expect(c.rows).toHaveLength(1);
    expect(base.some((r) => r.segment_id === c.segment_id && mapLayer(r) === mapLayer(c.rows[0]))).toBe(false);
  });

  it('puts every edge-case side only on blocks that were already mapped and on sides with no other rule', () => {
    const mapped = new Set(base.map((r) => r.segment_id));
    for (const c of cases) {
      expect(mapped.has(c.segment_id), c.id).toBe(true);
      expect(base.some((r) => r.segment_id === c.segment_id && r.side === c.side), c.id).toBe(false);
      for (const r of c.rows) expect([r.segment_id, r.side], c.id).toEqual([c.segment_id, c.side]);
    }
  });

  it('draws the stacked sides: not a sliver, not inner-facing', () => {
    for (const c of cases.filter((x) => x.kind === 'stack')) {
      const flags = trim.segments[c.segment_id];
      expect(flags.sliver, c.id).toBe(false);
      expect(c.side === 'L' ? flags.inner_L : flags.inner_R, c.id).toBe(false);
    }
  });
});

describe('addEdgeCases', () => {
  it('keeps every earlier row exactly where it was and appends the edge rows on the end', () => {
    expect(rows.slice(0, base.length)).toEqual(base);
    expect(rows.slice(base.length)).toEqual(edgeRows);
  });

  it('does not change which blocks have a rule, and the build script accepts every row', () => {
    expect(new Set(rows.map((r) => r.segment_id))).toEqual(new Set(base.map((r) => r.segment_id)));
    expect(() => buildLayers(real, rows, 'burbank-sample')).not.toThrow();
  });

  it('writes valid columns per layer and no permit code', () => {
    for (const r of edgeRows) {
      expect(r.type !== null, 'type').toBe(r.layer === 'restrictions');
      expect(r.limit_minutes !== null, 'limit').toBe(r.layer === 'timed_parking');
      expect(r.color_key !== null, 'color').toBe(r.layer === 'curb_color');
      expect(r.permit_code).toBeNull();
      if (r.color_key !== null) expect(Object.keys(CURB_COLORS)).toContain(r.color_key);
    }
  });
});

// The expected results in test-cases.md are written by hand in the edge-case definitions. This checks every one of them
// against the schedule engine, in the app's reference week, so a typo in either place shows up here.
describe('expected results', () => {
  const TZ = 'America/Los_Angeles';
  const dateAndTime = (d: Date) => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d).toLowerCase();
    return { date, time, day };
  };
  const effective = (r: RuleRow) => (r.layer === 'curb_color' && r.schedule === null ? CURB_COLORS[r.color_key!].default_schedule : r.schedule);

  it('lists exactly 3 day-and-hour times for every edge-case side, one result per rule', () => {
    for (const c of cases) {
      expect(c.checks, c.id).toHaveLength(3);
      expect(new Set(c.checks.map((k) => `${k.day}${k.hour}`)).size, c.id).toBe(3);
      for (const k of c.checks) expect(k.expected, c.id).toHaveLength(c.rows.length);
    }
  });

  for (const c of cases) {
    it(`matches the schedule engine for case ${c.id}`, () => {
      for (const k of c.checks) {
        const at = instantFor(k.day, k.hour);
        c.rows.forEach((r, i) => {
          const want = k.expected[i];
          const label = `${c.id} ${r.layer} ${k.day} ${k.hour}:00`;
          const schedule = effective(r) as Parameters<typeof isActive>[0];
          expect(isActive(schedule, at), `${label} active`).toBe(want.active);
          const change = nextChange(schedule, at);
          if (want.next === null) {
            expect(change, `${label} next`).toBeNull();
            return;
          }
          const from = dateAndTime(at);
          const to = dateAndTime(change!);
          expect({ day: to.day, time: to.time, daysLater: (Date.parse(to.date) - Date.parse(from.date)) / 86_400_000 }, `${label} next`).toEqual(want.next);
        });
      }
    });
  }
});

describe('edgeCasesToMarkdown', () => {
  const md = edgeCasesToMarkdown(cases, real, permitZones);
  const lines = (c: EdgeCase) => md.split('\n').filter((l) => l.includes(c.segment_id));

  it('names every edge-case side by segment_id, street, cross streets and side', () => {
    for (const c of cases) {
      const f = byId.get(c.segment_id)!.properties;
      expect(lines(c).length, c.id).toBeGreaterThan(0);
      expect(md).toContain(f.street);
      expect(md).toContain(`${f.from_street ?? '(none)'}`);
      expect(md).toContain(`${f.to_street ?? '(none)'}`);
      expect(lines(c).some((l) => l.includes(`**${c.side}**`) || l.includes(`side ${c.side}`) || l.includes(`| ${c.side} |`)), c.id).toBe(true);
    }
  });

  it('has a result for every rule at each of the 3 times of every case', () => {
    for (const c of cases) {
      for (const k of c.checks) {
        const heading = `${k.day[0].toUpperCase()}${k.day.slice(1)} ${String(k.hour).padStart(2, '0')}:00`;
        expect(md, `${c.id} ${heading}`).toContain(heading);
      }
    }
    expect(md.match(/^#### /gm)).toHaveLength(cases.length * 3);
  });

  it('says the inner-facing side is not drawn and the sliver is drawn', () => {
    expect(md).toMatch(/not drawn/i);
    expect(md).toMatch(/sliver[^\n]*drawn/i);
  });

  it('gives the permit zone each side lies in', () => {
    for (const c of cases) {
      const zone = permitCodeAt(byId.get(c.segment_id)!, permitZones, c.side);
      expect(md).toContain(zone === null ? 'Permit zone: none' : `Permit zone: ${zone}`);
    }
  });
});

describe('committed sample files', () => {
  it('rules.csv is the generator output with the edge cases appended', () => {
    const csv = readFileSync(resolve(data, 'burbank-sample', 'rules.csv'), 'utf8').replace(/\r\n/g, '\n');
    const committed = parseRuleRows(csv);
    expect(committed.slice(-edgeRows.length)).toEqual(edgeRows);
    expect(rowsToCsv(committed.slice(0, base.length))).toBe(rowsToCsv(base)); // through the CSV text: parsing turns an unset permit_mode into null
  });

  it('test-cases.md is exactly what the generator writes', () => {
    const onDisk = readFileSync(resolve(data, 'burbank-sample', 'test-cases.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(edgeCasesToMarkdown(cases, real, permitZones));
  });
});
