// "Active zones" (task M4-4, made to follow the hour, time mode and zone filter in M5-9): the timed parking rows in
// force under the shared selection. Pure: it reads the loader's timed parking rows, so the list matches the CSV rows,
// drawn or not, and it asks the layers' own activity check so it agrees with the map.
import type { SegmentCollection, Side, SideCollection } from '../data-loader';
import { filterByZone, isScheduleActive } from '../layers';
import type { Schedule, ScheduleWindow, TimeMode, Weekday } from '../schedule-engine';
import { clockText, dayName, scheduleText } from './format';

export interface DayZone {
  segmentId: string;
  street: string;
  side: Side;
  /** "2 hour limit", "45 minute limit" or "Timed parking" when the row has no limit. */
  limit: string;
  /** Exact hours on this day: "08:00–18:00", "all day", "until 06:00" (a window that began the day before). */
  hours: string;
  /** "Zone C permit exempt", or null when the row has no permit code. */
  permit: string | null;
  /** [lng, lat] to centre the map on. */
  center: [number, number];
}

const WEEK: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const before = (day: Weekday): Weekday => WEEK[(WEEK.indexOf(day) + 6) % 7];

const limitText = (minutes: unknown): string =>
  typeof minutes !== 'number' ? 'Timed parking' : minutes % 60 === 0 ? `${minutes / 60} hour limit` : `${minutes} minute limit`;

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

/** What the list follows: the shared day, hour, time mode (absent means hour) and zone filter (absent means all). */
export interface ActiveZonesSelection {
  day: Weekday;
  hour: number;
  mode?: TimeMode;
  zone?: string;
}

/**
 * Each timed parking row in force under the selection, sorted by street, side, then start of the hours. Hour: in
 * force at the hour. Day: in force at any time that day. All times: every row, with its full schedule. The zone
 * filter keeps only rows whose side lies in that permit zone (or in none).
 */
export function activeZones(timed: SideCollection, segments: SegmentCollection, at: ActiveZonesSelection, timeZone: string): DayZone[] {
  const { day } = at;
  const mode = at.mode ?? 'hour';
  const streets = new Map(segments.features.map((f) => [f.properties.segment_id, f.properties.street]));
  const zones: DayZone[] = [];
  for (const f of filterByZone(timed, at.zone).features) {
    const schedule = (f.properties.schedule ?? null) as Schedule;
    if (!isScheduleActive(schedule, { day, hour: at.hour, mode }, timeZone)) continue;
    const line = f.geometry.coordinates;
    const [a, b] = [line[Math.floor((line.length - 1) / 2)], line[Math.ceil((line.length - 1) / 2)]];
    const code = f.properties.permit_code;
    zones.push({
      segmentId: f.properties.segment_id,
      street: String(streets.get(f.properties.segment_id) ?? ''),
      side: f.properties.side,
      limit: limitText(f.properties.limit_minutes),
      hours: mode === 'all' ? scheduleText(schedule) : hoursText(schedule, day),
      permit: typeof code === 'string' && code !== '' ? `Zone ${code} permit exempt` : null,
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    });
  }
  return zones.sort(
    (x, y) => x.street.localeCompare(y.street) || x.side.localeCompare(y.side) || x.hours.localeCompare(y.hours),
  );
}

/** The panel heading: names the hour, day or all times, then the zone filter, then how many rows. */
export function activeZonesHeading(at: ActiveZonesSelection, count: number): string {
  const when =
    at.mode === 'all' ? 'all times' : at.mode === 'day' ? `${dayName(at.day)}, any time that day` : `${dayName(at.day)} ${clockText(at.hour, 0)}`;
  const zone = at.zone === undefined || at.zone === 'all' ? '' : at.zone === 'none' ? ', outside permit zones' : `, Zone ${at.zone}`;
  return `Active zones: ${when}${zone} (${count})`;
}
