import { localDayHour } from '../schedule-engine';
import type { Weekday } from '../schedule-engine';

/** The day and hour right now in the city's time zone (from city.json), not the device's. */
export function currentDayHour(timeZone: string): { day: Weekday; hour: number } {
  const { weekday, hour } = localDayHour(new Date(), timeZone);
  return { day: weekday, hour };
}
