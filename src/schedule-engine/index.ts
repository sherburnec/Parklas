export {
  instantFor, isActive, isActiveOnDay, localDayHour, localParts, nextChange, windowsOnDay, DEFAULT_TIME_ZONE,
} from './schedule';
export type { DayWindow, Schedule, ScheduleWindow, Weekday } from './schedule';

/**
 * How the time controls read a rule: `hour` is active at the chosen hour, `day` at any minute of the chosen day,
 * `all` always (the schedule is ignored).
 */
export type TimeMode = 'hour' | 'day' | 'all';
export const TIME_MODES: readonly TimeMode[] = ['hour', 'day', 'all'];
