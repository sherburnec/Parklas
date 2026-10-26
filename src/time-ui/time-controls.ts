import { TIME_MODES } from '../schedule-engine';
import type { TimeMode } from '../schedule-engine';
import { nowSelection } from './now';
import { createPlayer } from './play';
import { WEEKDAYS } from './state';
import type { AppState, AppStateStore } from './state';

const DAY_NAMES: Record<(typeof WEEKDAYS)[number], { short: string; long: string }> = {
  mon: { short: 'Mon', long: 'Monday' },
  tue: { short: 'Tue', long: 'Tuesday' },
  wed: { short: 'Wed', long: 'Wednesday' },
  thu: { short: 'Thu', long: 'Thursday' },
  fri: { short: 'Fri', long: 'Friday' },
  sat: { short: 'Sat', long: 'Saturday' },
  sun: { short: 'Sun', long: 'Sunday' },
};

/** "8:00 AM", "12:00 PM", "12:00 AM". */
export function formatHour(hour: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

export const MODE_LABELS: Record<TimeMode, string> = { hour: 'Hour', day: 'Day', all: 'All times' };

/** Which controls work in a mode: Day turns off the slider and play, All times also the day picker. */
export function controlsEnabled(mode: TimeMode): { day: boolean; slider: boolean; play: boolean } {
  return { day: mode !== 'all', slider: mode === 'hour', play: mode === 'hour' };
}

/** "Monday 8:00 AM" in Hour mode, "Tuesday, all day" in Day mode, "All times" in All times mode. */
export function formatSelection(s: Pick<AppState, 'day' | 'hour'> & { mode?: TimeMode }): string {
  if (s.mode === 'all') return MODE_LABELS.all;
  if (s.mode === 'day') return `${DAY_NAMES[s.day].long}, all day`;
  return `${DAY_NAMES[s.day].long} ${formatHour(s.hour)}`;
}

/**
 * Time mode (Hour, Day, All times), day picker (Monday to Sunday), hourly slider, Now and play, all reading and
 * writing the shared state.
 * `timeZone` is the city's, so Now follows Burbank time whatever the device clock says.
 */
export function createTimeControls(parent: HTMLElement, state: AppStateStore, timeZone: string): void {
  const panel = document.createElement('section');
  panel.id = 'time-controls';
  panel.setAttribute('aria-label', 'Day and time');

  const readout = document.createElement('output');
  readout.className = 'time-readout';
  readout.setAttribute('aria-live', 'polite');

  const modes = document.createElement('div');
  modes.className = 'mode-picker';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'Time mode');
  const modeButtons = new Map<TimeMode, HTMLButtonElement>();
  for (const mode of TIME_MODES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = MODE_LABELS[mode];
    button.addEventListener('click', () => state.set({ mode }));
    modeButtons.set(mode, button);
    modes.append(button);
  }

  const days = document.createElement('div');
  days.className = 'day-picker';
  days.setAttribute('role', 'group');
  days.setAttribute('aria-label', 'Day of week');
  const dayButtons = new Map<string, HTMLButtonElement>();
  for (const day of WEEKDAYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = DAY_NAMES[day].short;
    button.title = DAY_NAMES[day].long;
    button.addEventListener('click', () => state.set({ day }));
    dayButtons.set(day, button);
    days.append(button);
  }

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '23';
  slider.step = '1';
  slider.setAttribute('aria-label', 'Hour of day');
  slider.addEventListener('input', () => state.set({ hour: Number(slider.value) }));

  const play = document.createElement('button');
  play.type = 'button';
  const player = createPlayer(state, (playing) => {
    play.textContent = playing ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(playing));
  });
  play.textContent = 'Play';
  play.setAttribute('aria-pressed', 'false');
  play.addEventListener('click', () => player.toggle());

  const now = document.createElement('button');
  now.type = 'button';
  now.textContent = 'Now';
  now.title = `Jump to the current day and hour in ${timeZone}, in Hour mode`;
  now.addEventListener('click', () => {
    player.stop();
    state.set(nowSelection(timeZone));
  });

  const row = document.createElement('div');
  row.className = 'time-row';
  row.append(now, play, slider);
  panel.append(readout, modes, days, row);

  const show = (s: AppState): void => {
    readout.textContent = formatSelection(s);
    slider.value = String(s.hour);
    slider.setAttribute('aria-valuetext', formatHour(s.hour));
    for (const [day, button] of dayButtons) button.setAttribute('aria-pressed', String(day === s.day));
    for (const [mode, button] of modeButtons) button.setAttribute('aria-pressed', String(mode === s.mode));
    const enabled = controlsEnabled(s.mode);
    for (const button of dayButtons.values()) button.disabled = !enabled.day;
    slider.disabled = !enabled.slider;
    play.disabled = !enabled.play;
  };
  show(state.get());
  state.subscribe(show);
  parent.append(panel);
}
