import { ZONE_ALL, ZONE_NONE } from './state';
import type { AppStateStore } from './state';

/**
 * Zone selector: All, each permit code in `codes`, No zone. Reads and writes the shared state, so the choice is in
 * the URL. A zone in the state that is not one of `codes` (a stale link) is reset to All.
 */
export function createZoneFilter(parent: HTMLElement, state: AppStateStore, codes: readonly string[]): void {
  const panel = document.createElement('label');
  panel.id = 'zone-filter';
  panel.append('Permit zone ');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Permit zone filter');
  const options: Array<[string, string]> = [
    [ZONE_ALL, 'All'],
    ...[...codes].sort().map((code): [string, string] => [code, code]),
    [ZONE_NONE, 'No zone'],
  ];
  for (const [value, text] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  if (!options.some(([value]) => value === state.get().zone)) state.set({ zone: ZONE_ALL });
  select.value = state.get().zone;
  select.addEventListener('change', () => state.set({ zone: select.value }));
  state.subscribe((s) => {
    select.value = s.zone;
  });
  panel.append(select);
  parent.append(panel);
}
