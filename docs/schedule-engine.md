# Schedule engine

Code: `src/schedule-engine/` (task M2-1; requirements DM-1, FR-9). Pure functions with no map, DOM or fetch code. Import only through `src/schedule-engine/index.ts`.

## API

```ts
isActive(schedule: Schedule, dateTime: Date, timeZone = 'America/Los_Angeles'): boolean
nextChange(schedule: Schedule, dateTime: Date, timeZone = 'America/Los_Angeles'): Date | null
```

- `isActive` answers: is the rule in force at this instant, by the city's wall clock?
- `nextChange` returns the first instant strictly after `dateTime` at which the rule turns on or off, or `null` if it never changes.
- `dateTime` is an absolute instant (a `Date`). The engine converts it to local time in `timeZone`. Pass the city's time zone from its config; the default is only Burbank's.

## Schedule format

```json
{ "windows": [ { "days": ["mon"], "start": "18:00", "end": "06:00", "weeks_of_month": [1, 3] } ] }
```

| Field | Meaning |
| --- | --- |
| `schedule` = `null` | Always in force. `isActive` is true, `nextChange` is `null`. |
| `windows` | List of windows; the rule is active when any window is active. |
| `days` | Any of `sun mon tue wed thu fri sat`. The day the window **starts**. |
| `start`, `end` | 24-hour `HH:MM`, local time. `start` is included, `end` is excluded. `24:00` is allowed as an end. |
| `weeks_of_month` | Optional list of 1 to 5. Absent means every week. |

## Rules of evaluation

**Midnight crossing.** If `end` is earlier than `start`, the window runs into the next day. `mon 18:00 to 06:00` is active Monday from 18:00 and Tuesday until 05:59. It is not active early Monday. This also wraps the week: `sun 20:00 to 04:00` runs into Monday. If `start` equals `end`, the window is treated as a full 24 hours.

**Week of month.** Week = day of month divided by 7, rounded up: days 1 to 7 are week 1, 8 to 14 week 2, 15 to 21 week 3, 22 to 28 week 4, 29 to 31 week 5. It is a calendar-based count, not "the Nth occurrence of that weekday in a month that starts on a Monday". A window on week 5 does not exist in a month without a 5th week (for example February 2026), and it never falls back to week 4. A window that crosses midnight takes its week from the day it starts, so a Saturday week-1 window that runs into Sunday stays on when that Sunday is in week 2.

**Daylight saving time.** Windows are defined in wall-clock time, so they follow the city clock.
- Spring forward: a night window is one real hour shorter. `sat 22:00 to 06:00` on 2026-03-08 ends at 13:00 UTC, not 14:00.
- Fall back: it is one real hour longer, and a window covering 01:00 to 02:00 is active through both 1 AMs.
- A start or end time that does not exist (inside the skipped hour) resolves to the nearest valid instant.

**Hourly steps.** The UI checks `isActive` at HH:00 only (PLAN assumption). Exact start and end times come from `nextChange` and the schedule itself, so half-hour rules stay visible in the curb detail list.

## How `nextChange` works

1. Return `null` for a `null` schedule or one with no windows.
2. Compute the current state with `isActive`.
3. Collect every window start and end instant from yesterday (a crossing window's end) through 400 days ahead, keeping those after `dateTime`.
4. Sort them and return the first one where `isActive` differs from the current state.

Step 4 is why adjacent windows (`08:00 to 12:00` then `12:00 to 17:00`) report one change at 17:00, not two, and why overlapping windows do not report false changes.

Limits: it returns `null` if nothing changes within 400 days. That covers the longest gap a week-of-month rule can leave, but it also means a rule with no usable days (empty `days`) returns `null` rather than throwing.

## Errors

A malformed time string (not `HH:MM`, minutes over 59, or beyond `24:00`) throws `Invalid time "..."`. Schema validation (M2-2, M2-3) should catch these before the engine sees them; the engine does not validate days or `weeks_of_month` values.

## Tests

`src/schedule-engine/schedule.test.ts`, run with `npm test`. Every test instant is written in UTC with the local time in a comment. Burbank is UTC-8 until 2026-03-08 02:00, UTC-7 until 2026-11-01 02:00, then UTC-8 again. Cases: null and empty schedules, same-day windows, midnight crossing, Sunday into Monday, Saturday into Sunday, week-of-month (including a missing 5th week), and DST (spring forward, fall back, repeated hour, start time either side of the change).

## Not covered

Holidays (non-goal for Phase 1), validation of day names and week numbers, and changes more than 400 days away.
