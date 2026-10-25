import { LAYER_KEYS, LAYER_LABELS } from './state';
import type { AppStateStore, LayerKey } from './state';

/** Adds one checkbox per layer to `parent`. Each reads and writes the shared state, so the URL stays in step. */
export function createLayerToggles(parent: HTMLElement, state: AppStateStore, keys: readonly LayerKey[] = LAYER_KEYS): void {
  const panel = document.createElement('fieldset');
  panel.id = 'layer-toggles';
  const legend = document.createElement('legend');
  legend.textContent = 'Layers';
  panel.append(legend);
  const boxes = new Map<LayerKey, HTMLInputElement>();
  for (const key of keys) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.get().visible[key];
    box.addEventListener('change', () => state.setLayerVisible(key, box.checked));
    boxes.set(key, box);
    label.append(box, LAYER_LABELS[key]);
    panel.append(label);
  }
  state.subscribe((s) => {
    for (const [key, box] of boxes) box.checked = s.visible[key];
  });
  parent.append(panel);
}
