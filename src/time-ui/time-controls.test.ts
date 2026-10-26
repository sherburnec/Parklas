import { describe, expect, it } from 'vitest';
import { MODE_LABELS, controlsEnabled, formatSelection } from './time-controls';

describe('controlsEnabled (task M5-8)', () => {
  it('hour mode: everything works', () => {
    expect(controlsEnabled('hour')).toEqual({ day: true, slider: true, play: true });
  });
  it('day mode: the day picker works; slider and play are off', () => {
    expect(controlsEnabled('day')).toEqual({ day: true, slider: false, play: false });
  });
  it('all times mode: day picker, slider and play are all off', () => {
    expect(controlsEnabled('all')).toEqual({ day: false, slider: false, play: false });
  });
});

describe('MODE_LABELS', () => {
  it('names the three settings', () => {
    expect(MODE_LABELS).toEqual({ hour: 'Hour', day: 'Day', all: 'All times' });
  });
});

describe('formatSelection', () => {
  it('shows the day and hour in hour mode, and when no mode is given', () => {
    expect(formatSelection({ day: 'mon', hour: 8 })).toBe('Monday 8:00 AM');
    expect(formatSelection({ day: 'mon', hour: 8, mode: 'hour' })).toBe('Monday 8:00 AM');
  });
  it('shows the whole day in day mode and all times in all mode', () => {
    expect(formatSelection({ day: 'tue', hour: 8, mode: 'day' })).toBe('Tuesday, all day');
    expect(formatSelection({ day: 'tue', hour: 8, mode: 'all' })).toBe('All times');
  });
});
