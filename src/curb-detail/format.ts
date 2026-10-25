// Plain-words text for schedules and times in the click-through list (task M4-3).
import type { Schedule, Weekday } from '../schedule-engine';

const ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SHORT: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

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
