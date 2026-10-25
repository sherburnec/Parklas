// Fixed edge-case set for the sample data (task TD-9). Pure logic, no file I/O: the CLI reads and writes the files.
//
// Picks 3 street sides in different parts of the city and stacks rules from 4 layers on each, plus one inner-facing
// side and one sliver (both from trim.json) that get a single rule each. Every case carries 3 day-and-hour times with
// the result the map and the curb detail list should show, written out by hand here. The unit tests check each of them
// against the schedule engine, and the CLI turns them into data/burbank-sample/test-cases.md.
//
// The edge-case rows go on the end of rules.csv, on blocks that already have a rule and on sides that have none, so no
// earlier row moves and the share of mapped blocks does not change.
import type { RuleRow, SegmentCollection, Side } from './build.ts';
import { cellOf, CURB_COLORS, metres, mulberry32, permitCodeAt, pick, win, WEEKDAYS, MON_SAT, SIDES, type PermitZoneCollection } from './sample-data.ts';
import type { TrimData } from './trim.ts';

type Rng = () => number;
type Segment = SegmentCollection['features'][number];
type Day = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
type Window = { days: string[]; start: string; end: string; weeks_of_month?: number[] };

/** The next time a rule turns on or off, as the weekday and clock time plus whole days after the day checked. */
export interface Next {
  day: Day;
  time: string;
  daysLater: number;
}

export interface Expected {
  active: boolean;
  /** null: the rule never changes (always in force). */
  next: Next | null;
}

export interface EdgeCheck {
  day: Day;
  /** 0 to 23; a rule counts as active if it is in force at HH:00. */
  hour: number;
  /** One result per rule of the case, in the order of `rows`. */
  expected: Expected[];
}

export interface EdgeCase {
  id: string;
  kind: 'stack' | 'inner' | 'sliver';
  title: string;
  notes: string[];
  segment_id: string;
  side: Side;
  rows: RuleRow[];
  checks: EdgeCheck[];
}

const SEED_SALT = 0x45444745;
const MIN_STACK_LENGTH_M = 40; // a stacked side needs room for its bands
const MIN_CHECKS = 3;

const ALWAYS: Expected = { active: true, next: null };
const on = (day: Day, time: string, daysLater = 0): Expected => ({ active: true, next: { day, time, daysLater } });
const off = (day: Day, time: string, daysLater = 0): Expected => ({ active: false, next: { day, time, daysLater } });

const row = (layer: RuleRow['layer'], fields: Partial<RuleRow>): Omit<RuleRow, 'segment_id' | 'side'> => ({
  layer, type: null, limit_minutes: null, permit_code: null, permit_mode: null, color_key: null, schedule: null, ...fields,
});

type Template = { rows: Omit<RuleRow, 'segment_id' | 'side'>[]; checks: EdgeCheck[] };

// Case A: a window crossing midnight (22:00-06:00), a null schedule, an 08:30 start and a color that uses its default.
const STACK_A: Template = {
  rows: [
    row('sweeping', { schedule: win(['tue'], '08:30', '10:30') }),
    row('timed_parking', { limit_minutes: 120, schedule: null }),
    row('restrictions', { type: 'no_parking', schedule: win(['fri', 'sat'], '22:00', '06:00') }),
    row('curb_color', { color_key: 'green', schedule: null }), // the green default: Mon-Fri 08:00-18:00
  ],
  checks: [
    { day: 'tue', hour: 9, expected: [on('tue', '10:30'), ALWAYS, off('fri', '22:00', 3), on('tue', '18:00')] },
    { day: 'sat', hour: 2, expected: [off('tue', '08:30', 3), ALWAYS, on('sat', '06:00'), off('mon', '08:00', 2)] },
    { day: 'fri', hour: 23, expected: [off('tue', '08:30', 4), ALWAYS, on('sat', '06:00', 1), off('mon', '08:00', 3)] },
  ],
};

// Case B: a window from Sunday into Monday (Sun 20:00 to Mon 04:00), and a color with a schedule of its own.
const STACK_B: Template = {
  rows: [
    row('sweeping', { schedule: win(['mon'], '08:00', '10:00') }),
    row('timed_parking', { limit_minutes: 60, schedule: win(MON_SAT, '08:00', '18:00') }),
    row('restrictions', { type: 'no_standing', schedule: win(['sun'], '20:00', '04:00') }),
    row('curb_color', { color_key: 'red', schedule: win(WEEKDAYS, '16:00', '18:00') }), // replaces red's null default
  ],
  checks: [
    { day: 'sun', hour: 23, expected: [off('mon', '08:00', 1), off('mon', '08:00', 1), on('mon', '04:00', 1), off('mon', '16:00', 1)] },
    { day: 'mon', hour: 2, expected: [off('mon', '08:00'), off('mon', '08:00'), on('mon', '04:00'), off('mon', '16:00')] },
    { day: 'mon', hour: 8, expected: [on('mon', '10:00'), on('mon', '18:00'), off('sun', '20:00', 6), off('mon', '16:00')] },
  ],
};

// Case C: the one weeks_of_month [1, 3] row (a format test; Burbank does not use it), the 30 minute fallback style and
// a color whose config has no schedule, so it is always in force.
const STACK_C: Template = {
  rows: [
    row('sweeping', { schedule: win(['mon'], '09:00', '11:00', [1, 3]) }),
    row('timed_parking', { limit_minutes: 30, schedule: win(MON_SAT, '09:00', '18:00') }),
    row('restrictions', { type: 'no_stopping', schedule: win(WEEKDAYS, '07:00', '09:00') }),
    row('curb_color', { color_key: 'blue', schedule: null }),
  ],
  checks: [
    { day: 'mon', hour: 10, expected: [on('mon', '11:00'), on('mon', '18:00'), off('tue', '07:00', 1), ALWAYS] },
    { day: 'mon', hour: 7, expected: [off('mon', '09:00'), off('mon', '09:00'), on('mon', '09:00'), ALWAYS] },
    // The reference week has Monday 5 Jan in week 1; Monday 12 Jan is week 2 and skipped, so the next start is Monday 19 Jan.
    { day: 'thu', hour: 10, expected: [off('mon', '09:00', 11), on('thu', '18:00'), off('fri', '07:00', 1), ALWAYS] },
  ],
};

const INNER_SCHEDULE = win(WEEKDAYS, '08:00', '18:00');
const INNER_CHECKS: EdgeCheck[] = [
  { day: 'wed', hour: 10, expected: [on('wed', '18:00')] },
  { day: 'sat', hour: 12, expected: [off('mon', '08:00', 2)] },
  { day: 'fri', hour: 18, expected: [off('mon', '08:00', 3)] },
];

const SLIVER_SCHEDULE = win(['sat', 'sun'], '09:00', '17:00');
const SLIVER_CHECKS: EdgeCheck[] = [
  { day: 'sat', hour: 10, expected: [on('sat', '17:00')] },
  { day: 'sun', hour: 17, expected: [off('sat', '09:00', 6)] },
  { day: 'wed', hour: 12, expected: [off('sat', '09:00', 3)] },
];

/** The layer a row is drawn in. The restrictions file is split by type (FR-7). */
const mapLayerOf = (r: Pick<RuleRow, 'layer' | 'type'>): string => (r.layer === 'restrictions' && r.type !== 'no_parking' ? 'no_stopping_standing' : r.layer);

/** Layers tried in turn for the sliver's rule: the first that the block has no row in. */
const SLIVER_LAYERS: RuleRow['layer'][] = ['curb_color', 'sweeping', 'timed_parking', 'restrictions'];

function sliverRow(layer: RuleRow['layer']): Omit<RuleRow, 'segment_id' | 'side'> {
  switch (layer) {
    case 'curb_color':
      return row(layer, { color_key: 'yellow', schedule: SLIVER_SCHEDULE }); // its own schedule replaces yellow's null default
    case 'timed_parking':
      return row(layer, { limit_minutes: 60, schedule: SLIVER_SCHEDULE });
    case 'restrictions':
      return row(layer, { type: 'no_parking', schedule: SLIVER_SCHEDULE });
    default:
      return row(layer, { schedule: SLIVER_SCHEDULE });
  }
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const lengthOf = (segment: Segment): number => segment.geometry.coordinates.slice(1).reduce((n, p, i) => n + metres(segment.geometry.coordinates[i], p), 0);

/**
 * Chooses the five edge-case sides. `rows` are the rows of everything before the edge cases: a side qualifies only if it
 * has no row yet on a block that has some, so the edge-case side shows exactly the rules written here. Own generator, so
 * no other step is affected. Throws if the segments cannot supply a case.
 */
export function pickEdgeCases(rows: RuleRow[], segments: SegmentCollection, trim: TrimData, seed: number): EdgeCase[] {
  const rng = mulberry32((seed ^ SEED_SALT) >>> 0);
  const mapped = new Set<string>();
  const taken = new Set<string>();
  const layersOf = new Map<string, Set<string>>();
  for (const r of rows) {
    mapped.add(r.segment_id);
    taken.add(`${r.segment_id}|${r.side}`);
    layersOf.set(r.segment_id, (layersOf.get(r.segment_id) ?? new Set()).add(mapLayerOf(r)));
  }
  const flags = (s: Segment) => trim.segments[s.properties.segment_id];
  const isInner = (s: Segment, side: Side) => (side === 'L' ? flags(s).inner_L : flags(s).inner_R);
  const freeSides = (s: Segment) => SIDES.filter((side) => !taken.has(`${s.properties.segment_id}|${side}`));
  const ordered = shuffle(
    segments.features.filter((s) => mapped.has(s.properties.segment_id) && flags(s) !== undefined).sort((a, b) => (a.properties.segment_id < b.properties.segment_id ? -1 : 1)),
    rng,
  );
  const used = new Set<string>();
  const out: EdgeCase[] = [];
  const attach = (id: string, kind: EdgeCase['kind'], title: string, notes: string[], s: Segment, side: Side, tpl: Template) => {
    used.add(s.properties.segment_id);
    out.push({
      id, kind, title, notes, segment_id: s.properties.segment_id, side,
      rows: tpl.rows.map((r) => ({ ...r, segment_id: s.properties.segment_id, side })),
      checks: tpl.checks,
    });
  };

  // Stacked sides: not a sliver, not inner-facing, long enough, each in a different column and row of a 3 x 3 grid and on a different street.
  const stacks: [string, string, string[], Template][] = [
    ['A', 'Stack with a midnight crossing, a null schedule and an 08:30 start', [
      'Sweeping starts at 08:30. The slider steps by the hour, so at Tue 08:00 it shows not active and at Tue 09:00 active; the detail list always shows 08:30 to 10:30.',
      'The no parking window runs Fri 22:00 to Sat 06:00 and Sat 22:00 to Sun 06:00. At Sat 02:00 it is active through Friday night\'s window.',
      'Timed parking has no schedule, so it is always active and has no next change.',
      'The green curb row has no schedule of its own, so it follows the green default in curb-colors.json (Mon to Fri 08:00 to 18:00).',
    ], STACK_A],
    ['B', 'Stack with a Sunday-into-Monday window', [
      'No standing runs from Sun 20:00 to Mon 04:00. It is active at Mon 02:00 although Monday is not in its days.',
      'The red curb row has its own schedule, which replaces red\'s default (none).',
    ], STACK_B],
    ['C', 'Stack with a weeks_of_month [1, 3] row', [
      'Weeks of month is a format test only; Burbank does not use it. The app\'s reference week is Sun 4 Jan to Sat 10 Jan 2026, so Mon 5 Jan is week 1 and the sweeping row is active at Mon 10:00. Mon 12 Jan (week 2) is skipped, so from Thu 8 Jan the next change is Mon 19 Jan, 11 days later.',
      'The 30 minute timed parking row tests the fallback style.',
      'The blue curb row has no schedule and blue has no default, so it is always active.',
    ], STACK_C],
  ];
  const cols = new Set<string>();
  const rowsUsed = new Set<string>();
  const streets = new Set<string>();
  for (const [id, title, notes, tpl] of stacks) {
    const found = ordered.find((s) => {
      const [col, rowIndex] = cellOf(s, segments, 3).split(',');
      return (
        !used.has(s.properties.segment_id) && !flags(s).sliver && lengthOf(s) >= MIN_STACK_LENGTH_M &&
        !cols.has(col) && !rowsUsed.has(rowIndex) && !streets.has(s.properties.street) &&
        freeSides(s).some((side) => !isInner(s, side))
      );
    });
    if (!found) throw new Error(`No segment can hold edge case ${id}`);
    const [col, rowIndex] = cellOf(found, segments, 3).split(',');
    cols.add(col);
    rowsUsed.add(rowIndex);
    streets.add(found.properties.street);
    attach(id, 'stack', title, notes, found, pick(freeSides(found).filter((side) => !isInner(found, side)), rng), tpl);
  }

  const inner = ordered.find((s) => !used.has(s.properties.segment_id) && !flags(s).sliver && freeSides(s).some((side) => isInner(s, side)));
  if (!inner) throw new Error('No segment has a free inner-facing side for edge case D');
  attach('D', 'inner', 'Inner-facing side with one rule', [
    'trim.json flags this side as inner-facing, so the map never draws it at any hour. The curb detail list must still list the rule, with its state and next change.',
    'The other side of this block, and any rule on it, is not part of this case.',
  ], inner, pick(freeSides(inner).filter((side) => isInner(inner, side)), rng), { rows: [row('timed_parking', { limit_minutes: 120, schedule: INNER_SCHEDULE })], checks: INNER_CHECKS });

  const sliver = ordered.find((s) => !used.has(s.properties.segment_id) && flags(s).sliver && freeSides(s).length > 0 && SLIVER_LAYERS.some((l) => !layersOf.get(s.properties.segment_id)?.has(mapLayerOf({ layer: l, type: l === 'restrictions' ? 'no_parking' : null }))));
  if (!sliver) throw new Error('No sliver has a free side and a free layer for edge case E');
  const sliverLayer = SLIVER_LAYERS.find((l) => !layersOf.get(sliver.properties.segment_id)?.has(mapLayerOf({ layer: l, type: l === 'restrictions' ? 'no_parking' : null })))!;
  attach('E', 'sliver', 'Sliver with one rule', [
    'This block is under 20 m (a sliver in trim.json). Slivers are drawn only if they have a rule in the layer, and this is the only row in its layer on the block, so its band must be drawn.',
    'The other side of this block, and any rule on it, is not part of this case.',
  ], sliver, pick(freeSides(sliver), rng), { rows: [sliverRow(sliverLayer)], checks: SLIVER_CHECKS });

  for (const c of out) if (c.checks.length < MIN_CHECKS) throw new Error(`Edge case ${c.id} needs ${MIN_CHECKS} times`);
  return out;
}

/** The base rows with the edge-case rows on the end. */
export function addEdgeCases(rows: RuleRow[], cases: EdgeCase[]): RuleRow[] {
  return [...rows, ...cases.flatMap((c) => c.rows)];
}

// ---- test-cases.md ----

const DAY_LABEL: Record<Day, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const dayLabel = (d: string) => DAY_LABEL[d as Day];
const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const daysText = (days: string[]): string => {
  const key = days.join();
  if (key === WEEKDAYS.join()) return 'Mon–Fri';
  if (key === MON_SAT.join()) return 'Mon–Sat';
  return days.map(dayLabel).join(', ');
};

function scheduleText(schedule: unknown): string {
  if (schedule === null) return 'none (always in force)';
  return (schedule as { windows: Window[] }).windows
    .map((w) => `${daysText(w.days)} ${w.start}–${w.end}${w.end < w.start ? ' (crosses midnight)' : ''}${w.weeks_of_month ? `, weeks ${w.weeks_of_month.join(' and ')} of the month` : ''}`)
    .join('; ');
}

const MAP_LAYER_NAME: Record<string, string> = {
  sweeping: 'Street sweeping',
  timed_parking: 'Timed parking',
  restrictions: 'Restrictions',
  no_stopping_standing: 'No stopping/standing',
  curb_color: 'Curb colors',
};

function ruleText(r: RuleRow): string {
  switch (r.layer) {
    case 'sweeping':
      return 'Street sweeping';
    case 'timed_parking':
      return `${r.limit_minutes} minute limit`;
    case 'restrictions':
      return { no_parking: 'No parking', no_standing: 'No standing', no_stopping: 'No stopping' }[r.type as string] ?? String(r.type);
    case 'curb_color':
      return `${r.color_key} curb${r.schedule === null ? ` (uses the color's default: ${scheduleText(CURB_COLORS[r.color_key!].default_schedule)})` : ''}`;
  }
}

const nextText = (n: Next | null): string => (n === null ? 'no next change' : `next change ${dayLabel(n.day)} ${n.time}${n.daysLater > 0 ? ` (${n.daysLater} day${n.daysLater === 1 ? '' : 's'} later)` : ''}`);

/** What the map should show for one rule of a case at one time. */
function mapText(c: EdgeCase, e: Expected): string {
  if (c.kind === 'inner') return 'not drawn (inner-facing side)';
  return e.active ? 'band drawn, active (full strength)' : 'band drawn, muted';
}

export function edgeCasesToMarkdown(cases: EdgeCase[], segments: SegmentCollection, permitZones: PermitZoneCollection): string {
  const byId = new Map(segments.features.map((f) => [f.properties.segment_id, f]));
  const out: string[] = [];
  out.push('# Sample edge cases (task TD-9)', '');
  out.push('Written by `npm run generate:sample`. Do not edit by hand; `npm test` fails if this file differs from what the script writes.', '');
  out.push(
    'Each case below is one street side whose rules are the last rows of `rules.csv`. Check the map and the curb detail list against the results listed for each time.',
    '',
    '- **Times.** All times are on the Burbank clock (America/Los_Angeles) in the app\'s reference week: Sun 4 Jan to Sat 10 Jan 2026. The slider steps by the hour, and a rule counts as active if it is in force at HH:00. The detail list shows exact start and end times.',
    '- **Map.** "Active" bands are drawn at full strength and inactive bands muted. Each rule is drawn in its own layer, so a side with rules in several layers shows several parallel bands.',
    '- **Detail list.** Lists every rule on the side, active or not, with its next change. "Next change" is the next time the rule turns on or off, counted from the hour checked.',
    '- **Side.** L and R are relative to the segment\'s direction (first to last coordinate in `segments.geojson`), facing along it.',
    '',
  );
  out.push('| Case | segment_id | Street | Cross streets | Side | What it tests |', '| --- | --- | --- | --- | --- | --- |');
  for (const c of cases) {
    const p = byId.get(c.segment_id)!.properties;
    out.push(`| ${c.id} | \`${c.segment_id}\` | ${p.street} | ${p.from_street ?? '(none)'} and ${p.to_street ?? '(none)'} | ${c.side} | ${c.title} |`);
  }
  out.push('');

  for (const c of cases) {
    const p = byId.get(c.segment_id)!.properties;
    const zone = permitCodeAt(byId.get(c.segment_id)!, permitZones, c.side);
    out.push(`## Case ${c.id}: ${c.title}`, '');
    out.push(`- segment_id: \`${c.segment_id}\``);
    out.push(`- Street: ${p.street}, between ${p.from_street ?? '(none)'} and ${p.to_street ?? '(none)'}`);
    out.push(`- Side: **${c.side}**`);
    out.push(`- Permit zone: ${zone ?? 'none'}`);
    out.push(
      c.kind === 'inner'
        ? '- Drawing: not drawn at any hour (inner-facing side); its rule still appears in the detail list'
        : c.kind === 'sliver'
          ? '- Drawing: a sliver (under 20 m), drawn because it has a rule in this layer'
          : '- Drawing: drawn, one band per layer',
    );
    for (const n of c.notes) out.push(`- ${n}`);
    out.push('', '| # | Map layer | Rule | Schedule |', '| --- | --- | --- | --- |');
    c.rows.forEach((r, i) => {
      const layer = MAP_LAYER_NAME[mapLayerOf(r)];
      out.push(`| ${i + 1} | ${layer} | ${ruleText(r)} | ${scheduleText(r.schedule)} |`);
    });
    out.push('');
    for (const k of c.checks) {
      out.push(`#### ${dayLabel(k.day)} ${hh(k.hour)}`, '', '| # | Map layer | Map shows | Detail list shows |', '| --- | --- | --- | --- |');
      c.rows.forEach((r, i) => {
        const e = k.expected[i];
        out.push(`| ${i + 1} | ${MAP_LAYER_NAME[mapLayerOf(r)]} | ${mapText(c, e)} | ${e.active ? 'Active' : 'Not active'}, ${nextText(e.next)} |`);
      });
      out.push('');
    }
  }
  return out.join('\n');
}
