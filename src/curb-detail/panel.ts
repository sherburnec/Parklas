// The click-through panel (task M4-3): both sides of the clicked block, every rule on each, from the loader's data.
import { describeSegment } from './detail';
import type { DetailData, DetailTime, SegmentView, SideView } from './detail';
import { dayName } from './format';

export interface CurbDetailOptions {
  timeZone: string;
  /** Shown for a block with no rule rows (the "not yet mapped" message from the basemap). */
  unmappedMessage: string;
  /** The shared day and hour; the list restates itself when it changes. */
  state: { get(): DetailTime; subscribe(listener: (s: DetailTime) => void): () => void };
}

export interface CurbDetail {
  show(segmentId: string): void;
  close(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

const hourText = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

function sideSection(side: SideView): HTMLElement {
  const section = el('section', undefined, 'curb-side');
  section.append(el('h3', `Side ${side.side}, ${side.grid} side (city grid)`));
  const zone = side.permitZone === undefined ? 'not recorded (no rules on this side)' : (side.permitZone ?? 'none');
  section.append(el('p', `Permit zone: ${zone}`, 'curb-zone'));
  if (!side.drawn) {
    section.append(el('p', 'Not drawn on the map (it faces another road). Its rules are listed here.', 'curb-note'));
  }
  if (side.rules.length === 0) {
    section.append(el('p', 'No rules entered for this side.', 'curb-none'));
    return section;
  }
  const list = el('ul');
  for (const r of side.rules) {
    const item = el('li', undefined, r.active ? 'curb-rule active' : 'curb-rule');
    item.append(el('strong', `${r.layer}: ${r.rule}`));
    if (r.note) item.append(el('div', r.note));
    if (r.permit) item.append(el('div', r.permit));
    item.append(el('div', `Schedule: ${r.scheduleText}${r.scheduleSource === 'default' ? " (the color's default)" : ''}`));
    item.append(el('div', r.status));
    list.append(item);
  }
  section.append(list);
  return section;
}

function render(view: SegmentView, at: DetailTime, unmappedMessage: string, onClose: () => void): HTMLElement {
  const root = el('div');
  const close = el('button', 'Close');
  close.type = 'button';
  close.addEventListener('click', onClose);
  root.append(close);
  root.append(el('h2', view.heading));
  root.append(el('p', `Between ${view.fromStreet} and ${view.toStreet}`));
  if (!view.mapped) {
    root.append(el('p', unmappedMessage, 'curb-unmapped'));
    return root;
  }
  root.append(el('p', `Next changes counted from ${dayName(at.day)} ${hourText(at.hour)}.`, 'curb-note'));
  for (const side of view.sides) root.append(sideSection(side));
  return root;
}

export function createCurbDetail(container: HTMLElement, data: DetailData, options: CurbDetailOptions): CurbDetail {
  const panel = el('aside');
  panel.id = 'curb-detail';
  panel.setAttribute('aria-live', 'polite');
  panel.hidden = true;
  container.append(panel);

  let shown: string | null = null;
  const draw = (): void => {
    if (shown === null) return;
    const at = options.state.get();
    const view = describeSegment(data, shown, at, options.timeZone);
    panel.replaceChildren(render(view, at, options.unmappedMessage, api.close));
    panel.hidden = false;
  };
  const api: CurbDetail = {
    show(segmentId) {
      shown = segmentId;
      draw();
    },
    close() {
      shown = null;
      panel.hidden = true;
      panel.replaceChildren();
    },
  };
  options.state.subscribe(draw);
  return api;
}
