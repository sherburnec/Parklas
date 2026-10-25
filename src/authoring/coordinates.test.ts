// Task M2-7.2: the text shown for the last point clicked on the authoring map.
import { describe, expect, it } from 'vitest';
import { formatCoordinates } from './coordinates';

describe('formatCoordinates', () => {
  it('writes longitude then latitude, as GeoJSON orders them, to 6 decimals', () => {
    expect(formatCoordinates({ lng: -118.3089, lat: 34.18 })).toBe('-118.308900, 34.180000');
  });

  it('rounds rather than truncates', () => {
    expect(formatCoordinates({ lng: -118.3089996, lat: 34.1800004 })).toBe('-118.309000, 34.180000');
  });

  it('never shows a negative zero', () => {
    expect(formatCoordinates({ lng: 0, lat: -0.0000001 })).toBe('0.000000, 0.000000');
  });
});
