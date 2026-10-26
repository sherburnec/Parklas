import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, nextHour } from './play';
import { createAppState } from './state';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('nextHour', () => {
  it('adds one and loops at midnight', () => {
    expect(nextHour(0)).toBe(1);
    expect(nextHour(22)).toBe(23);
    expect(nextHour(23)).toBe(0);
  });
});

describe('createPlayer', () => {
  it('advances one hour per second and keeps the day', () => {
    const state = createAppState('?day=tue&hour=8');
    const player = createPlayer(state);
    player.start();
    expect(state.get().hour).toBe(8);
    vi.advanceTimersByTime(1000);
    expect(state.get().hour).toBe(9);
    vi.advanceTimersByTime(3000);
    expect(state.get()).toMatchObject({ day: 'tue', hour: 12 });
    player.stop();
  });

  it('loops from 23 back to 0 on the same day', () => {
    const state = createAppState('?day=sun&hour=22');
    const player = createPlayer(state);
    player.start();
    vi.advanceTimersByTime(2000);
    expect(state.get()).toMatchObject({ day: 'sun', hour: 0 });
    player.stop();
  });

  it('stops advancing, and toggle flips between playing and paused', () => {
    const state = createAppState('?hour=5');
    const changes = vi.fn();
    const player = createPlayer(state, changes);
    expect(player.toggle()).toBe(true);
    expect(player.isPlaying()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(player.toggle()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(state.get().hour).toBe(6);
    expect(changes).toHaveBeenLastCalledWith(false);
  });

  it('start twice does not double the speed', () => {
    const state = createAppState('?hour=0');
    const player = createPlayer(state);
    player.start();
    player.start();
    vi.advanceTimersByTime(2000);
    expect(state.get().hour).toBe(2);
    player.stop();
  });
});

describe('play and the time mode (task M5-8)', () => {
  it('stops when the mode leaves hour, and does not move the hour again', () => {
    const state = createAppState('?day=tue&hour=8');
    const changes = vi.fn();
    const player = createPlayer(state, changes);
    player.start();
    vi.advanceTimersByTime(1000);
    state.set({ mode: 'day' });
    expect(player.isPlaying()).toBe(false);
    expect(changes).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(5000);
    expect(state.get().hour).toBe(9);
  });

  it('stops when the mode goes to all times', () => {
    const state = createAppState('?hour=8');
    const player = createPlayer(state);
    player.start();
    state.set({ mode: 'all' });
    expect(player.isPlaying()).toBe(false);
  });

  it('does not start outside hour mode', () => {
    const state = createAppState('?hour=8&mode=day');
    const player = createPlayer(state);
    expect(player.toggle()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(state.get().hour).toBe(8);
  });

  it('keeps playing when something else changes', () => {
    const state = createAppState('?hour=8');
    const player = createPlayer(state);
    player.start();
    state.set({ day: 'fri' });
    expect(player.isPlaying()).toBe(true);
    player.stop();
  });
});
