import { describe, expect, it } from 'vitest';
import { buildLayers, parseRuleRows, type SegmentCollection as BuildSegments } from '../../scripts/lib/build';
import type { PermitZones } from '../../scripts/lib/permit-zones';
import type { CurbColorsConfig, SegmentCollection, SideCollection, TrimData } from '../data-loader';
import type { Weekday } from '../schedule-engine';
import { describeSegment, type DetailData } from './detail';
import { gridSide } from './grid';
import { scheduleText } from './format';

const ZONE = 'America/Los_Angeles';
// The data files as text, through Vite, so this test needs no Node types.
const files = import.meta.glob(
  ['../../data/burbank/segments.geojson', '../../data/burbank/trim.json', '../../data/burbank-sample/*.{json,geojson,csv,md}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const read = (...parts: string[]): string => {
  const text = files[`../../data/${parts.join('/')}`];
  if (text === undefined) throw new Error(`missing data file ${parts.join('/')}`);
  return text;
};

// The same join the build script does, from the sample set's own files.
const segments = JSON.parse(read('burbank', 'segments.geojson')) as BuildSegments;
const permitZones = JSON.parse(read('burbank-sample', 'permit-zones.geojson')) as PermitZones;
const built = buildLayers(segments, parseRuleRows(read('burbank-sample', 'rules.csv')), 'burbank-sample', permitZones);
const data: DetailData = {
  segments: segments as unknown as SegmentCollection,
  sweeping: built.sweeping as unknown as SideCollection,
  timedParking: built.timedParking as unknown as SideCollection,
  restrictions: built.restrictions as unknown as SideCollection,
  curbColors: built.curbColors as unknown as SideCollection,
  coverage: built.coverage,
  trim: JSON.parse(read('burbank', 'trim.json')) as TrimData,
  curbColorConfig: JSON.parse(read('burbank-sample', 'curb-colors.json')) as CurbColorsConfig,
};

describe('scheduleText', () => {
  const w = (days: string[], start: string, end: string, weeks?: number[]) => ({
    windows: [{ days: days as Weekday[], start, end, ...(weeks ? { weeks_of_month: weeks } : {}) }],
  });
  it('names null as always in force', () => {
    expect(scheduleText(null)).toBe('none (always in force)');
  });
  it('writes runs of three or more days as a range and shorter lists in full', () => {
    expect(scheduleText(w(['mon', 'tue', 'wed', 'thu', 'fri'], '08:00', '18:00'))).toBe('Mon–Fri 08:00–18:00');
    expect(scheduleText(w(['fri', 'sat'], '22:00', '06:00'))).toBe('Fri, Sat 22:00–06:00 (crosses midnight)');
    expect(scheduleText(w(['sat', 'sun'], '09:00', '17:00'))).toBe('Sat, Sun 09:00–17:00');
    expect(scheduleText(w(['mon', 'tue', 'wed', 'fri'], '08:00', '10:00'))).toBe('Mon–Wed, Fri 08:00–10:00');
  });
  it('says which weeks of the month apply', () => {
    expect(scheduleText(w(['mon'], '09:00', '11:00', [1, 3]))).toBe('Mon 09:00–11:00, weeks 1 and 3 of the month');
    expect(scheduleText(w(['mon'], '09:00', '11:00', [2]))).toBe('Mon 09:00–11:00, week 2 of the month');
  });
  it('lists several windows and an empty list', () => {
    const two = { windows: [...w(['mon'], '08:00', '09:00').windows, ...w(['tue'], '10:00', '11:00').windows] };
    expect(scheduleText(two)).toBe('Mon 08:00–09:00; Tue 10:00–11:00');
    expect(scheduleText({ windows: [] })).toBe('none (never in force)');
  });
});

describe('gridSide', () => {
  // City north is about compass 311 degrees (display only; nothing is stored). Facing grid east (compass 41),
  // the left hand is grid north.
  const line = (bearingDeg: number): [number, number][] => {
    const rad = (bearingDeg * Math.PI) / 180;
    const lat = 34.18;
    return [[-118.3, lat], [-118.3 + (Math.sin(rad) * 0.001) / Math.cos((lat * Math.PI) / 180), lat + Math.cos(rad) * 0.001]];
  };
  it('labels the sides of a street running along the city grid', () => {
    expect(gridSide(line(41), 'L')).toBe('north');
    expect(gridSide(line(41), 'R')).toBe('south');
    expect(gridSide(line(221), 'L')).toBe('south');
    expect(gridSide(line(131), 'L')).toBe('east');
    expect(gridSide(line(131), 'R')).toBe('west');
    expect(gridSide(line(311), 'L')).toBe('west');
  });
  it('gives opposite sides different labels for any direction', () => {
    for (let b = 0; b < 360; b += 7) expect(gridSide(line(b), 'L')).not.toBe(gridSide(line(b), 'R'));
  });
});

describe('describeSegment', () => {
  const id = 'burbank-1790974706-1790974762';

  it('lists both sides of a segment with street and cross streets', () => {
    const view = describeSegment(data, id, { day: 'tue', hour: 9 }, ZONE);
    expect(view.mapped).toBe(true);
    expect(view.street).toBe('Winona Avenue');
    expect(view.fromStreet).toBe('North Reese Place');
    expect(view.toStreet).toBe('North Orchard Drive');
    expect(view.sides.map((s) => s.side)).toEqual(['L', 'R']);
    expect(view.sides[0].rules).toHaveLength(4);
    expect(view.sides[0].permitZone).toBe('DEMO-B');
  });

  it('leaves the permit zone unknown for a side with no rule rows', () => {
    const rows = [data.sweeping, data.timedParking, data.restrictions, data.curbColors].flatMap((c) => c.features);
    const sides = new Set(rows.map((f) => `${f.properties.segment_id}/${f.properties.side}`));
    const oneSided = rows.find((f) => !sides.has(`${f.properties.segment_id}/${f.properties.side === 'L' ? 'R' : 'L'}`))!;
    const view = describeSegment(data, oneSided.properties.segment_id, { day: 'mon', hour: 8 }, ZONE);
    const empty = view.sides.find((s) => s.side !== oneSided.properties.side)!;
    expect(empty.rules).toHaveLength(0);
    expect(empty.permitZone).toBeUndefined();
  });

  it('marks a segment with no rule rows as not mapped', () => {
    const unmapped = data.segments.features.find((f) => !data.coverage.segment_ids.includes(f.properties.segment_id))!;
    const view = describeSegment(data, unmapped.properties.segment_id, { day: 'mon', hour: 8 }, ZONE);
    expect(view.mapped).toBe(false);
    expect(view.sides.every((s) => s.rules.length === 0)).toBe(true);
  });

  it('words permit codes as exempt on timed parking and as required on an except-by-permit restriction', () => {
    const exempt = data.timedParking.features.find((f) => f.properties.permit_code)!;
    const exemptView = describeSegment(data, exempt.properties.segment_id, { day: 'mon', hour: 8 }, ZONE);
    const timed = exemptView.sides.flatMap((s) => s.rules).filter((r) => r.layer === 'Timed parking');
    expect(timed.some((r) => r.permit === `Zone ${exempt.properties.permit_code} permit exempt`)).toBe(true);

    const required = data.restrictions.features.find((f) => f.properties.permit_mode === 'required')!;
    const requiredView = describeSegment(data, required.properties.segment_id, { day: 'mon', hour: 8 }, ZONE);
    const rules = requiredView.sides.flatMap((s) => s.rules).filter((r) => r.layer === 'Restrictions');
    expect(rules.some((r) => r.permit === `Zone ${required.properties.permit_code} permit required`)).toBe(true);
  });

  it('lists every row on a side from the loaded data, however the map draws it', () => {
    // Every rule row in all four files shows up in exactly one side's list.
    const rows = [data.sweeping, data.timedParking, data.restrictions, data.curbColors].flatMap((c) => c.features);
    const bySide = new Map<string, number>();
    for (const f of rows) {
      const key = `${f.properties.segment_id}/${f.properties.side}`;
      bySide.set(key, (bySide.get(key) ?? 0) + 1);
    }
    for (const [key, count] of [...bySide].slice(0, 60)) {
      const [segmentId, side] = key.split('/');
      const view = describeSegment(data, segmentId, { day: 'mon', hour: 8 }, ZONE);
      expect(view.sides.find((s) => s.side === side)!.rules).toHaveLength(count);
    }
  });
});

// ---- test-cases.md (task TD-9): every case, side and time, parsed from the generated file ----

interface MdTime {
  label: string;
  rows: { layer: string; detail: string }[];
}
interface MdCase {
  name: string;
  segmentId: string;
  street: string;
  side: 'L' | 'R';
  permitZone: string | null;
  drawn: boolean;
  rules: { layer: string; rule: string; schedule: string }[];
  times: MdTime[];
}

const cells = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());

function parseCases(md: string): MdCase[] {
  const out: MdCase[] = [];
  let current: MdCase | null = null;
  let section: 'head' | 'rules' | 'time' = 'head';
  for (const line of md.split('\n')) {
    const h = /^## Case (\w): /.exec(line);
    if (h) {
      current = { name: h[1], segmentId: '', street: '', side: 'L', permitZone: null, drawn: true, rules: [], times: [] };
      out.push(current);
      section = 'head';
      continue;
    }
    if (!current) continue;
    let m: RegExpExecArray | null;
    if ((m = /^- segment_id: `(.+)`/.exec(line))) current.segmentId = m[1];
    else if ((m = /^- Street: (.+)/.exec(line))) current.street = m[1];
    else if ((m = /^- Side: \*\*([LR])\*\*/.exec(line))) current.side = m[1] as 'L' | 'R';
    else if ((m = /^- Permit zone: (.+)/.exec(line))) current.permitZone = m[1] === 'none' ? null : m[1];
    else if (/^- Drawing: not drawn/.test(line)) current.drawn = false;
    else if ((m = /^#### (.+)/.exec(line))) {
      current.times.push({ label: m[1], rows: [] });
      section = 'time';
    } else if (line.startsWith('| # | Map layer | Rule |')) section = 'rules';
    else if (line.startsWith('| # | Map layer | Map shows |')) section = 'time';
    else if (/^\| \d+ \|/.test(line)) {
      const c = cells(line);
      if (section === 'rules') current.rules.push({ layer: c[1], rule: c[2], schedule: c[3] });
      else current.times[current.times.length - 1].rows.push({ layer: c[1], detail: c[3] });
    }
  }
  return out;
}

const cases = parseCases(read('burbank-sample', 'test-cases.md'));
const DAYS: Record<string, Weekday> = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };

describe('test-cases.md', () => {
  it('has the five cases', () => {
    expect(cases.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(cases.every((c) => c.times.length === 3)).toBe(true);
  });

  for (const c of cases) {
    describe(`case ${c.name}`, () => {
      const at = (label: string) => {
        const [day, time] = label.split(' ');
        return { day: DAYS[day], hour: Number(time.split(':')[0]) };
      };
      const sideOf = (label: string) => {
        const view = describeSegment(data, c.segmentId, at(label), ZONE);
        return { view, side: view.sides.find((s) => s.side === c.side)! };
      };

      it('shows the street, cross streets and permit zone', () => {
        const { view, side } = sideOf(c.times[0].label);
        expect(`${view.street}, between ${view.fromStreet} and ${view.toStreet}`).toBe(c.street);
        expect(side.permitZone ?? null).toBe(c.permitZone);
        expect(view.mapped).toBe(true);
      });

      it('says when the side is not drawn but still lists its rules', () => {
        const { side } = sideOf(c.times[0].label);
        expect(side.drawn).toBe(c.drawn);
        expect(side.rules.length).toBeGreaterThan(0);
      });

      it('lists the same rules and schedules as the case table', () => {
        const { side } = sideOf(c.times[0].label);
        expect(side.rules.map((r) => r.layer)).toEqual(c.rules.map((r) => r.layer));
        side.rules.forEach((r, i) => {
          const expected = c.rules[i];
          const rule = r.scheduleSource === 'default' ? `${r.rule} (uses the color's default: ${r.scheduleText})` : r.rule;
          expect(rule).toBe(expected.rule);
          // The table's schedule column is the row's own schedule; a color default is not the row's.
          expect(r.scheduleSource === 'default' ? 'none (always in force)' : r.scheduleText).toBe(expected.schedule);
        });
      });

      for (const t of c.times) {
        it(`shows the expected state and next change at ${t.label}`, () => {
          const { side } = sideOf(t.label);
          expect(side.rules.map((r) => ({ layer: r.layer, detail: r.status }))).toEqual(t.rows);
        });
      }
    });
  }
});
