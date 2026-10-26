// Plain-words text for schedules and times in the click-through list (task M4-3).
import { windowsOnDay } from '../schedule-engine';
import type { Schedule, TimeMode, Weekday } from '../schedule-engine';

const ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SHORT: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** "1200 block of West Olive Avenue", or the street with "block number not recorded" when there is no number. */
export function blockHeading(street: string, blockNumber: number | null): string {
  return blockNumber === null ? `${street}, block number not recorded` : `${blockNumber} block of ${street}`;
}

export const dayName = (day: Weekday): string => SHORT[day];

/** Runs of three or more consecutive days read as a range ("Mon–Fri"); shorter runs are listed ("Fri, Sat"). */
function daysText(days: Weekday[]): string {
  const idx = [...new Set(days.map((d) => ORDER.indexOf(d)))].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    if (j - i >= 2) parts.push(`${SHORT[ORDER[idx[i]]]}–${SHORT[ORDER[idx[j]]]}`);
    else for (let k = i; k <= j; k++) parts.push(SHORT[ORDER[idx[k]]]);
    i = j + 1;
  }
  return parts.join(', ');
}

function weeksText(weeks: number[]): string {
  const sorted = [...weeks].sort((a, b) => a - b);
  if (sorted.length === 1) return `week ${sorted[0]} of the month`;
  return `weeks ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]} of the month`;
}

/** Exact start and end times, e.g. "Fri, Sat 22:00–06:00 (crosses midnight)". null reads as always in force. */
export function scheduleText(schedule: Schedule): string {
  if (schedule === null) return 'none (always in force)';
  if (schedule.windows.length === 0) return 'none (never in force)';
  return schedule.windows
    .map((w) => {
      const crosses = w.end < w.start ? ' (crosses midnight)' : '';
      const weeks = w.weeks_of_month && w.weeks_of_month.length > 0 ? `, ${weeksText(w.weeks_of_month)}` : '';
      return `${daysText(w.days)} ${w.start}–${w.end}${weeks}${crosses}`;
    })
    .join('; ');
}

const two = (n: number): string => String(n).padStart(2, '0');

export const clockText = (hour: number, minute: number): string => `${two(hour)}:${two(minute)}`;

/** "Active, next change Tue 10:30", "Not active, next change Fri 22:00 (3 days later)" or "Active, no next change". */
export function statusText(
  active: boolean,
  next: { weekday: Weekday; hour: number; minute: number; daysLater: number } | null,
): string {
  const state = active ? 'Active' : 'Not active';
  if (next === null) return `${state}, no next change`;
  const later = next.daysLater > 0 ? ` (${next.daysLater} ${next.daysLater === 1 ? 'day' : 'days'} later)` : '';
  return `${state}, next change ${SHORT[next.weekday]} ${clockText(next.hour, next.minute)}${later}`;
}

/** Day mode: the exact hours a schedule gives on the day containing `instant`, or "Not active today". Null reads "all day". */
export function dayWindowsText(schedule: Schedule, instant: Date, timeZone: string): string {
  if (schedule === null) return 'all day';
  const parts = windowsOnDay(schedule, instant, timeZone).flatMap(({ window: w, startsToday, carriesIn }) => {
    const crosses = w.end < w.start ? ' (crosses midnight)' : '';
    return [
      ...(carriesIn ? [{ order: -1, text: `until ${w.end}` }] : []),
      ...(startsToday ? [{ order: Number(w.start.slice(0, 2)) * 60 + Number(w.start.slice(3, 5)), text: `${w.start}–${w.end}${crosses}` }] : []),
    ];
  });
  if (parts.length === 0) return 'Not active today';
  // A tail carried in from yesterday comes first, then the windows that start today by start time.
  return parts.sort((a, b) => a.order - b.order).map((p) => p.text).join(', ');
}

/** The line at the top of the list that says which time mode is on. */
export function modeNote(at: { day: Weekday; hour: number; mode?: TimeMode }): string {
  switch (at.mode ?? 'hour') {
    case 'day':
      return `Day mode: each rule’s windows on ${SHORT[at.day]}.`;
    case 'all':
      return 'All times mode: each rule’s full schedule.';
    default:
      return `Hour mode: next changes counted from ${SHORT[at.day]} ${clockText(at.hour, 0)}.`;
  }
}
