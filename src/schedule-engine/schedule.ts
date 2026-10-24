export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface ScheduleWindow {
  days: Weekday[];
  /** 24-hour "HH:MM" local time. */
  start: string;
  /** 24-hour "HH:MM" local time. Earlier than start means the window crosses midnight. */
  end: string;
  /** 1 to 5; absent means every week. Applies to the day the window starts on. */
  weeks_of_month?: number[];
}

/** null means always in force. */
export type Schedule = { windows: ScheduleWindow[] } | null;

export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** How far ahead nextChange looks. Covers the longest gap a week-of-month rule can leave. */
const SEARCH_DAYS = 400;

interface LocalTime {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: Weekday;
  minutes: number; // minutes since local midnight
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of an instant, as UTC-style numbers. */
function wallClock(instant: Date, timeZone: string): { ms: number; local: LocalTime } {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const { year, month, day, hour, minute, second } = parts;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  return {
    ms,
    local: {
      year,
      month,
      day,
      weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
      minutes: hour * 60 + minute,
    },
  };
}

/** The instant at which the city clock reads the given wall time. */
function instantAt(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  // Offset can differ either side of a DST change, so settle in two passes.
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    guess = wall - (wallClock(new Date(guess), timeZone).ms - guess);
  }
  return new Date(guess);
}

function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time "${hhmm}", expected HH:MM`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || minutes > 24 * 60) throw new Error(`Invalid time "${hhmm}"`);
  return minutes;
}

function weekOfMonth(day: number): number {
  return Math.ceil(day / 7);
}

/** Does a window that starts on this local date apply (weekday and week of month)? */
function startsOn(w: ScheduleWindow, weekday: Weekday, day: number): boolean {
  if (!w.days.includes(weekday)) return false;
  return !w.weeks_of_month || w.weeks_of_month.includes(weekOfMonth(day));
}

function windowActive(w: ScheduleWindow, now: LocalTime, yesterday: LocalTime): boolean {
  const start = parseTime(w.start);
  const end = parseTime(w.end);
  if (start < end) {
    return startsOn(w, now.weekday, now.day) && now.minutes >= start && now.minutes < end;
  }
  // Crosses midnight (an equal start and end is treated as a full 24 hours).
  if (startsOn(w, now.weekday, now.day) && now.minutes >= start) return true;
  return startsOn(w, yesterday.weekday, yesterday.day) && now.minutes < end;
}

/** Is the rule in force at this instant, by the city's wall clock? */
export function isActive(
  schedule: Schedule,
  dateTime: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  if (schedule === null) return true;
  const { local } = wallClock(dateTime, timeZone);
  const yesterday = wallClock(new Date(Date.UTC(local.year, local.month - 1, local.day - 1, 12)), 'UTC')
    .local;
  return schedule.windows.some((w) => windowActive(w, local, yesterday));
}

/**
 * The first instant after dateTime at which the rule turns on or off, or null
 * if it never changes (always in force, never in force, or no change within
 * the next SEARCH_DAYS days).
 */
export function nextChange(
  schedule: Schedule,
  dateTime: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | null {
  if (schedule === null || schedule.windows.length === 0) return null;

  const { local } = wallClock(dateTime, timeZone);
  const state = isActive(schedule, dateTime, timeZone);
  const after = dateTime.getTime();

  // Every window edge from yesterday (a crossing window's end) onwards.
  const edges = new Set<number>();
  for (let i = -1; i <= SEARCH_DAYS; i++) {
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + i, 12));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const weekday = WEEKDAYS[date.getUTCDay()];
    for (const w of schedule.windows) {
      if (!startsOn(w, weekday, d)) continue;
      const start = parseTime(w.start);
      const end = parseTime(w.end);
      const endMinutes = end > start ? end : end + 24 * 60;
      const s = instantAt(y, m, d, start, timeZone).getTime();
      const e = instantAt(y, m, d, endMinutes, timeZone).getTime();
      if (s > after) edges.add(s);
      if (e > after) edges.add(e);
    }
  }

  // Adjacent or overlapping windows leave edges where nothing changes; skip those.
  for (const edge of [...edges].sort((a, b) => a - b)) {
    if (isActive(schedule, new Date(edge), timeZone) !== state) return new Date(edge);
  }
  return null;
}
