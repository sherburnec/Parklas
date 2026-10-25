import type { AppStateStore } from './state';

/** One hour per second. */
export const PLAY_INTERVAL_MS = 1000;

/** The next hour, looping from 23 back to 0 on the same day. */
export const nextHour = (hour: number): number => (hour + 1) % 24;

export interface Player {
  start(): void;
  stop(): void;
  /** Flips between playing and paused. Returns whether it is now playing. */
  toggle(): boolean;
  isPlaying(): boolean;
}

/** Advances the shared hour once a second while playing. `onChange` hears each start and stop. */
export function createPlayer(state: AppStateStore, onChange: (playing: boolean) => void = () => {}): Player {
  let timer: ReturnType<typeof setInterval> | undefined;
  const player: Player = {
    start() {
      if (timer !== undefined) return;
      timer = setInterval(() => state.set({ hour: nextHour(state.get().hour) }), PLAY_INTERVAL_MS);
      onChange(true);
    },
    stop() {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
      onChange(false);
    },
    toggle() {
      if (timer === undefined) player.start();
      else player.stop();
      return timer !== undefined;
    },
    isPlaying: () => timer !== undefined,
  };
  return player;
}
