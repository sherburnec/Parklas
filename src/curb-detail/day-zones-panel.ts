// The "active zones" panel (task M4-4, renamed in M5-9, extended to every rule layer in M5-9.2): the rules in force on
// the shared selection, grouped by the layers that are toggled on. Click one to centre the map.
import type { ActiveZonesData } from './day-zones';
import { ACTIVE_LAYER_KEYS, activeZones, activeZonesHeading, countRows } from './day-zones';
import type { ActiveZonesSelection, DayZone } from './day-zones';

export interface DayZonesOptions {
  timeZone: string;
  /** The shared selection; the list is rebuilt when its day, hour, mode, zone or a layer toggle changes. */
  state: { get(): ActiveZonesSelection; subscribe(listener: (s: ActiveZonesSelection) => void): () => void };
  /** Called with the chosen row; the caller moves the map (this module never touches it). */
  onSelect(zone: DayZone): void;
}

export function createDayZones(container: HTMLElement, data: ActiveZonesData, options: DayZonesOptions): void {
  const panel = document.createElement('details');
  panel.id = 'day-zones';
  const summary = document.createElement('summary');
  const body = document.createElement('div');
  panel.append(summary, body);
  container.append(panel);

  let shown = '';
  const draw = (): void => {
    const at = options.state.get();
    const toggles = ACTIVE_LAYER_KEYS.map((k) => (at.visible?.[k] === false ? 0 : 1)).join('');
    const key = [at.day, at.hour, at.mode ?? 'hour', at.zone ?? 'all', toggles].join('|');
    if (key === shown) return;
    shown = key;
    const groups = activeZones(data, at, options.timeZone);
    summary.textContent = activeZonesHeading(at, countRows(groups));
    body.replaceChildren();
    if (groups.length === 0) {
      const none = document.createElement('p');
      none.textContent = 'Every rule layer is switched off.';
      body.append(none);
      return;
    }
    for (const group of groups) {
      const section = document.createElement('section');
      section.dataset.layer = group.key;
      const heading = document.createElement('h3');
      heading.textContent = `${group.label} (${group.rows.length})`;
      const list = document.createElement('ul');
      section.append(heading, list);
      body.append(section);
      if (group.rows.length === 0) {
        const none = document.createElement('li');
        none.textContent = 'None in force for this selection.';
        list.append(none);
        continue;
      }
      for (const z of group.rows) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        const title = document.createElement('strong');
        title.textContent = `${z.street}, side ${z.side}`;
        const detail = document.createElement('span');
        detail.textContent = [z.rule, z.hours, z.permit].filter((s) => s !== null).join(' · ');
        button.append(title, detail);
        button.addEventListener('click', () => options.onSelect(z));
        item.append(button);
        list.append(item);
      }
    }
  };
  draw();
  options.state.subscribe(draw);
}
