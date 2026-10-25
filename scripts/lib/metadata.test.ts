import { describe, expect, it } from 'vitest';
import { buildMetadata } from './metadata.ts';

describe('buildMetadata', () => {
  it('writes the date in the city time zone, not UTC', () => {
    // 02:00 UTC on 25 Oct is still the evening of 24 Oct in Los Angeles.
    const m = buildMetadata('burbank', new Date('2026-10-25T02:00:00Z'), 'America/Los_Angeles');
    expect(m).toEqual({ city_id: 'burbank', last_updated: '2026-10-24' });
  });

  it('pads month and day', () => {
    expect(buildMetadata('x', new Date('2026-03-05T20:00:00Z'), 'America/Los_Angeles').last_updated).toBe('2026-03-05');
  });
});
