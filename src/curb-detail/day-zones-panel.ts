// The "active zones" panel (task M4-4, renamed in M5-9): timed parking in force on the shared day, click one to centre the map.
import type { SegmentCollection, SideCollection } from '../data-loader';
import { activeZones, activeZonesHeading } from './day-zones';
import type { ActiveZonesSelection, DayZone } from './day-zones';

export interface DayZonesOptions {
  timeZone: string;
  /** The shared selection; the list is rebuilt when its day, hour, mode or zone changes. */
  state: { get(): ActiveZonesSelection; subscribe(listener: (s: ActiveZonesSelection) => void): () => void };
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

  let shown = '';
  const draw = (): void => {
    const at = options.state.get();
    const key = [at.day, at.hour, at.mode ?? 'hour', at.zone ?? 'all'].join('|');
    if (key === shown) return;
    shown = key;
    const zones = activeZones(data.timedParking, data.segments, at, options.timeZone);
    summary.textContent = activeZonesHeading(at, zones.length);
    list.replaceChildren();
    if (zones.length === 0) {
      const none = document.createElement('li');
      none.textContent = 'No timed parking in force for this selection.';
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
