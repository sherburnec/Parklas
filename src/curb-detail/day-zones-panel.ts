// The "zones for the day" panel (task M4-4): timed parking in force on the shared day, click one to centre the map.
import type { SegmentCollection, SideCollection } from '../data-loader';
import type { Weekday } from '../schedule-engine';
import { zonesForDay } from './day-zones';
import type { DayZone } from './day-zones';
import { dayName } from './format';

export interface DayZonesOptions {
  timeZone: string;
  /** The shared day; the list is rebuilt when it changes. */
  state: { get(): { day: Weekday }; subscribe(listener: (s: { day: Weekday }) => void): () => void };
  /** Called with the chosen zone; the caller moves the map (this module never touches it). */
  onSelect(zone: DayZone): void;
}

export function createDayZones(
  container: HTMLElement,
  data: { timedParking: SideCollection; segments: SegmentCollection },
  options: DayZonesOptions,
): void {
  const panel = document.createElement('details');
  panel.id = 'day-zones';
  const summary = document.createElement('summary');
  const list = document.createElement('ul');
  panel.append(summary, list);
  container.append(panel);

  let shown: Weekday | null = null;
  const draw = (): void => {
    const { day } = options.state.get();
    if (day === shown) return;
    shown = day;
    const zones = zonesForDay(data.timedParking, data.segments, day, options.timeZone);
    summary.textContent = `Zones for the day: ${dayName(day)} (${zones.length})`;
    list.replaceChildren();
    if (zones.length === 0) {
      const none = document.createElement('li');
      none.textContent = 'No timed parking in force on this day.';
      list.append(none);
      return;
    }
    for (const z of zones) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const title = document.createElement('strong');
      title.textContent = `${z.street}, side ${z.side}`;
      const detail = document.createElement('span');
      detail.textContent = [z.limit, z.hours, z.permit].filter((s) => s !== null).join(' · ');
      button.append(title, detail);
      button.addEventListener('click', () => options.onSelect(z));
      item.append(button);
      list.append(item);
    }
  };
  draw();
  options.state.subscribe(draw);
}
