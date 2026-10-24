import { describe, expect, it } from 'vitest';
import { buildLayers, sideToOffset, type Line, type SegmentCollection } from './build.ts';

// Burbank latitude, so a degree of longitude is shorter than a degree of latitude.
const eastward: Line = [[-118.31, 34.18], [-118.30, 34.18]];
const westward: Line = [[-118.30, 34.18], [-118.31, 34.18]];
const northward: Line = [[-118.31, 34.18], [-118.31, 34.19]];
const southward: Line = [[-118.31, 34.19], [-118.31, 34.18]];

describe('sideToOffset', () => {
  it('east-west street drawn west to east: north curb is on the left, south on the right', () => {
    expect(sideToOffset('N', eastward)).toBe('left');
    expect(sideToOffset('S', eastward)).toBe('right');
  });

  it('east-west street drawn east to west: the same curbs swap offset', () => {
    expect(sideToOffset('N', westward)).toBe('right');
    expect(sideToOffset('S', westward)).toBe('left');
  });

  it('north-south street drawn south to north: east curb is on the right, west on the left', () => {
    expect(sideToOffset('E', northward)).toBe('right');
    expect(sideToOffset('W', northward)).toBe('left');
  });

  it('north-south street drawn north to south: the same curbs swap offset', () => {
    expect(sideToOffset('E', southward)).toBe('left');
    expect(sideToOffset('W', southward)).toBe('right');
  });

  it('uses the whole block, not the first edge, for a bent block', () => {
    const bent: Line = [[-118.31, 34.18], [-118.3099, 34.1801], [-118.30, 34.1802]];
    expect(sideToOffset('N', bent)).toBe('left');
  });

  it('rejects N/S on a north-south block and E/W on an east-west block', () => {
    expect(() => sideToOffset('N', northward)).toThrow(/north-south/);
    expect(() => sideToOffset('E', eastward)).toThrow(/east-west/);
  });
});

function segments(): SegmentCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { segment_id: 'ew-1', street: 'Olive Avenue', from_street: 'A St', to_street: 'B St', city_id: 'testville' },
        geometry: { type: 'LineString', coordinates: eastward },
      },
      {
        type: 'Feature',
        properties: { segment_id: 'ns-1', street: 'Hollywood Way', from_street: null, to_street: 'C St', city_id: 'testville' },
        geometry: { type: 'LineString', coordinates: southward },
      },
      {
        type: 'Feature',
        properties: { segment_id: 'unruled', street: 'Quiet Ln', from_street: null, to_street: null, city_id: 'testville' },
        geometry: { type: 'LineString', coordinates: northward },
      },
    ],
  };
}

const sched = { windows: [{ days: ['mon'], start: '08:00', end: '10:00' }] };

const row = (r: Partial<Record<string, unknown>>) => ({
  segment_id: 'ew-1', side: 'N', layer: 'sweeping', type: null, limit_minutes: null, permit_code: null, color_key: null, schedule: null, ...r,
});

describe('buildLayers', () => {
  const out = buildLayers(
    segments(),
    [
      row({ side: 'N', layer: 'sweeping', schedule: sched }),
      row({ side: 'S', layer: 'timed_parking', limit_minutes: 120, permit_code: 'A' }),
      row({ segment_id: 'ns-1', side: 'E', layer: 'restrictions', type: 'no_stopping' }),
      row({ segment_id: 'ns-1', side: 'W', layer: 'curb_color', color_key: 'red' }),
      row({ segment_id: 'ns-1', side: 'W', layer: 'sweeping', schedule: sched }),
    ],
    'testville',
  );

  it('writes one feature per rule row into the matching layer, with city_id on every feature', () => {
    expect(out.sweeping.features).toHaveLength(2);
    expect(out.timedParking.features).toHaveLength(1);
    expect(out.restrictions.features).toHaveLength(1);
    expect(out.curbColors.features).toHaveLength(1);
    for (const fc of [out.sweeping, out.timedParking, out.restrictions, out.curbColors]) {
      expect(fc.type).toBe('FeatureCollection');
      for (const f of fc.features) {
        expect(f.type).toBe('Feature');
        expect(f.properties.city_id).toBe('testville');
        expect(f.geometry.type).toBe('LineString');
        expect(f.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('computes the offset from side and line direction', () => {
    const ew = out.sweeping.features.find((f) => f.properties.segment_id === 'ew-1')!;
    expect(ew.properties).toMatchObject({ side: 'N', offset: 'left', street: 'Olive Avenue', schedule: sched });
    expect(out.timedParking.features[0].properties).toMatchObject({ side: 'S', offset: 'right', limit_minutes: 120, permit_code: 'A' });
    // ns-1 runs north to south, so east is on the left and west on the right.
    expect(out.restrictions.features[0].properties).toMatchObject({ side: 'E', offset: 'left', type: 'no_stopping' });
    expect(out.curbColors.features[0].properties).toMatchObject({ side: 'W', offset: 'right', color_key: 'red' });
  });

  it('copies the segment geometry and street names, and keeps layer-specific fields off other layers', () => {
    const f = out.sweeping.features[0];
    expect(f.geometry.coordinates).toEqual(eastward);
    expect(f.properties).toMatchObject({ from_street: 'A St', to_street: 'B St' });
    expect(f.properties).not.toHaveProperty('limit_minutes');
    expect(f.properties).not.toHaveProperty('color_key');
  });

  it('lists each segment with at least one rule once, sorted', () => {
    expect(out.coverage).toEqual({ city_id: 'testville', segment_ids: ['ew-1', 'ns-1'] });
  });

  it('writes empty collections and empty coverage when there are no rows', () => {
    const empty = buildLayers(segments(), [], 'testville');
    expect(empty.sweeping.features).toEqual([]);
    expect(empty.coverage.segment_ids).toEqual([]);
  });

  it('names the row when a side does not fit the block', () => {
    expect(() => buildLayers(segments(), [row({ side: 'E' })], 'testville')).toThrow(/rules\.csv row 2.*ew-1/);
  });
});
