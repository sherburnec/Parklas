// "Active zones" (task M4-4; made to follow the hour, time mode and zone filter in M5-9, and to cover every rule layer
// and the layer toggles in M5-9.2): the rules in force under the shared selection. Pure: it reads the loader's rule
// rows, so the list matches the CSV rows, drawn or not (a side the map hides still lists). Activity comes from the
// layers' own style functions, so the list agrees with the map.
import type { CurbColorsConfig, SegmentCollection, Side, SideCollection } from '../data-loader';
import {
  curbColorStyle, filterByZone, noStoppingStyle, restrictionsStyle, sweepingStyle, timedParkingStyle,
} from '../layers';
import type { TimeSelection } from '../layers';
import type { Schedule, ScheduleWindow, TimeMode, Weekday } from '../schedule-engine';
import { clockText, dayName, scheduleText } from './format';

/** The rule layers the list covers, in the order the groups appear. These are the keys of the shared layer toggles. */
export const ACTIVE_LAYER_KEYS = ['sweeping', 'timed_parking', 'restrictions', 'no_stopping', 'curb_colors'] as const;
export type ActiveLayerKey = (typeof ACTIVE_LAYER_KEYS)[number];

const GROUP_LABELS: Record<ActiveLayerKey, string> = {
  sweeping: 'Street sweeping',
  timed_parking: 'Timed parking',
  restrictions: 'Restrictions',
  no_stopping: 'No stopping / standing',
  curb_colors: 'Curb colors',
};

export interface DayZone {
  segmentId: string;
  street: string;
  side: Side;
  /** The rule in words: "2 hour limit", "Street sweeping", "No parking except by permit", "Red curb". */
  rule: string;
  /** Exact hours on this day: "08:00–18:00", "all day", "until 06:00" (a window that began the day before). */
  hours: string;
  /** "Zone C permit exempt" or "Zone C permit required", or null when the row has no permit code. */
  permit: string | null;
  /** [lng, lat] to centre the map on. */
  center: [number, number];
}

/** The rows in force for one toggled-on layer. */
export interface ActiveGroup {
  key: ActiveLayerKey;
  label: string;
  rows: DayZone[];
}

/** The loaded rows the list reads. */
export interface ActiveZonesData {
  segments: SegmentCollection;
  sweeping: SideCollection;
  timedParking: SideCollection;
  restrictions: SideCollection;
  curbColors: SideCollection;
  /** Gives the curb colors their labels and default schedules; without it a color row has neither. */
  curbColorConfig: CurbColorsConfig | null;
}

const WEEK: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const before = (day: Weekday): Weekday => WEEK[(WEEK.indexOf(day) + 6) % 7];

const limitText = (minutes: unknown): string =>
  typeof minutes !== 'number' ? 'Timed parking' : minutes % 60 === 0 ? `${minutes / 60} hour limit` : `${minutes} minute limit`;

const hasPermit = (code: unknown): code is string => typeof code === 'string' && code !== '';

/** The exact hours the windows give on this day, including the tail of a window that crossed midnight into it. */
function hoursText(schedule: Schedule, day: Weekday): string {
  if (schedule === null) return 'all day';
  const parts: string[] = [];
  const crosses = (w: ScheduleWindow): boolean => w.end < w.start;
  for (const w of schedule.windows) {
    if (crosses(w) && w.days.includes(before(day))) parts.push(`until ${w.end}`);
    if (w.days.includes(day)) parts.push(`${w.start}–${w.end}${crosses(w) ? ' (crosses midnight)' : ''}`);
  }
  return parts.join(', ');
}

/** What the list follows: the shared day, hour, time mode (absent means hour), zone filter (absent means all) and toggles. */
export interface ActiveZonesSelection {
  day: Weekday;
  hour: number;
  mode?: TimeMode;
  zone?: string;
  /** Which layers are toggled on. A layer that is absent counts as on; false leaves its group out. */
  visible?: Partial<Record<ActiveLayerKey, boolean>>;
}

type StyledRow = SideCollection['features'][number]['properties'];

/** How one layer words a row, from the properties its style function added. */
interface LayerRows {
  style(rows: SideCollection, at: TimeSelection, timeZone: string, config: CurbColorsConfig | null): SideCollection;
  source(data: ActiveZonesData): SideCollection;
  rule(p: StyledRow): string;
  permit(p: StyledRow): string | null;
}

const noPermit = (): null => null;

const LAYERS: Record<ActiveLayerKey, LayerRows> = {
  sweeping: { style: sweepingStyle, source: (d) => d.sweeping, rule: () => 'Street sweeping', permit: noPermit },
  timed_parking: {
    style: timedParkingStyle,
    source: (d) => d.timedParking,
    rule: (p) => limitText(p.limit_minutes),
    permit: (p) => (hasPermit(p.permit_code) ? `Zone ${p.permit_code} permit exempt` : null),
  },
  restrictions: {
    style: restrictionsStyle,
    source: (d) => d.restrictions,
    rule: (p) => (p.kind === 'permit_required' ? 'No parking except by permit' : 'No parking'),
    permit: (p) => (typeof p.permit_label === 'string' ? p.permit_label : null),
  },
  // A permit code on these rows is ignored, as on the map.
  no_stopping: {
    style: noStoppingStyle,
    source: (d) => d.restrictions,
    rule: (p) => (p.dashed === true ? 'No standing' : 'No stopping'),
    permit: noPermit,
  },
  curb_colors: {
    style: (rows, at, timeZone, config) => (config ? curbColorStyle(rows, config, at, timeZone) : unlabelled(rows, at, timeZone)),
    source: (d) => d.curbColors,
    rule: (p) => String(p.label),
    permit: noPermit,
  },
};

/** Curb colors without a config: the layer cannot draw them, but the rows still list, as "Curb color <key>". */
function unlabelled(rows: SideCollection, at: TimeSelection, timeZone: string): SideCollection {
  const styled = sweepingStyle(rows, at, timeZone);
  return {
    ...styled,
    features: styled.features.map((f) => ({ ...f, properties: { ...f.properties, label: `Curb color ${String(f.properties.color_key)}` } })),
  };
}

/** The midpoint of the row's line. */
function centreOf(line: number[][]): [number, number] {
  const [a, b] = [line[Math.floor((line.length - 1) / 2)], line[Math.ceil((line.length - 1) / 2)]];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * For each layer that is toggled on, the rows in force under the selection, sorted by street, side, then hours.
 * Hour: in force at the hour. Day: in force at any time that day. All times: every row, with its full schedule. The
 * zone filter keeps only rows whose side lies in that permit zone (or in none). A toggled-on layer with nothing in
 * force still has a group, with no rows.
 */
export function activeZones(data: ActiveZonesData, at: ActiveZonesSelection, timeZone: string): ActiveGroup[] {
  const { day } = at;
  const mode = at.mode ?? 'hour';
  const selection: TimeSelection = { day, hour: at.hour, mode, zone: at.zone };
  const streets = new Map(data.segments.features.map((f) => [f.properties.segment_id, f.properties.street]));
  const groups: ActiveGroup[] = [];
  for (const key of ACTIVE_LAYER_KEYS) {
    if (at.visible?.[key] === false) continue;
    const layer = LAYERS[key];
    const rows: DayZone[] = [];
    for (const f of layer.style(filterByZone(layer.source(data), at.zone), selection, timeZone, data.curbColorConfig).features) {
      if (f.properties.active !== true) continue;
      const schedule = (f.properties.schedule ?? null) as Schedule;
      rows.push({
        segmentId: f.properties.segment_id,
        street: String(streets.get(f.properties.segment_id) ?? ''),
        side: f.properties.side,
        rule: layer.rule(f.properties),
        hours: mode === 'all' ? scheduleText(schedule) : hoursText(schedule, day),
        permit: layer.permit(f.properties),
        center: centreOf(f.geometry.coordinates),
      });
    }
    rows.sort((x, y) => x.street.localeCompare(y.street) || x.side.localeCompare(y.side) || x.hours.localeCompare(y.hours));
    groups.push({ key, label: GROUP_LABELS[key], rows });
  }
  return groups;
}

/** The total over every group, for the heading. */
export const countRows = (groups: ActiveGroup[]): number => groups.reduce((sum, g) => sum + g.rows.length, 0);

/** The panel heading: names the hour, day or all times, then the zone filter, then how many rows in all. */
export function activeZonesHeading(at: ActiveZonesSelection, count: number): string {
  const when =
    at.mode === 'all' ? 'all times' : at.mode === 'day' ? `${dayName(at.day)}, any time that day` : `${dayName(at.day)} ${clockText(at.hour, 0)}`;
  const zone = at.zone === undefined || at.zone === 'all' ? '' : at.zone === 'none' ? ', outside permit zones' : `, Zone ${at.zone}`;
  return `Active zones: ${when}${zone} (${count})`;
}
