// "Zones for the day" (task M4-4): the timed parking rows in force on the chosen day. Pure: it reads the
// loader's timed parking rows, so the list matches the CSV rows for that day, drawn or not.
import type { SegmentCollection, Side, SideCollection } from '../data-loader';
import { instantFor, isActive } from '../schedule-engine';
import type { Schedule, ScheduleWindow, Weekday } from '../schedule-engine';

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

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const limitText = (minutes: unknown): string =>
  typeof minutes !== 'number' ? 'Timed parking' : minutes % 60 === 0 ? `${minutes / 60} hour limit` : `${minutes} minute limit`;

/**
 * Is the rule in force at any moment of this day? Checks midnight and each window start that day, which
 * covers every change of state, and reads the engine, so it agrees with the map (including week of month).
 */
function inForce(schedule: Schedule, day: Weekday, timeZone: string): boolean {
  if (schedule === null) return true;
  const midnight = instantFor(day, 0, timeZone).getTime();
  const starts = new Set([0, ...schedule.windows.filter((w) => w.days.includes(day)).map((w) => minutesOf(w.start))]);
  return [...starts].some((m) => isActive(schedule, new Date(midnight + m * 60_000), timeZone));
}

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

/** Each timed parking row in force on the day, sorted by street, side, then start of the hours. */
export function zonesForDay(timed: SideCollection, segments: SegmentCollection, day: Weekday, timeZone: string): DayZone[] {
  const streets = new Map(segments.features.map((f) => [f.properties.segment_id, f.properties.street]));
  const zones: DayZone[] = [];
  for (const f of timed.features) {
    const schedule = (f.properties.schedule ?? null) as Schedule;
    if (!inForce(schedule, day, timeZone)) continue;
    const line = f.geometry.coordinates;
    const [a, b] = [line[Math.floor((line.length - 1) / 2)], line[Math.ceil((line.length - 1) / 2)]];
    const code = f.properties.permit_code;
    zones.push({
      segmentId: f.properties.segment_id,
      street: String(streets.get(f.properties.segment_id) ?? ''),
      side: f.properties.side,
      limit: limitText(f.properties.limit_minutes),
      hours: hoursText(schedule, day),
      permit: typeof code === 'string' && code !== '' ? `Zone ${code} permit exempt` : null,
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    });
  }
  return zones.sort(
    (x, y) => x.street.localeCompare(y.street) || x.side.localeCompare(y.side) || x.hours.localeCompare(y.hours),
  );
}
