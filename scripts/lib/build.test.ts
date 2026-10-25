import { describe, expect, it } from 'vitest';
import { buildLayers, parseRuleRows, sideToOffset, type Line, type Offset, type SegmentCollection } from './build.ts';

// Burbank latitude, so a degree of longitude is shorter than a degree of latitude.
const eastward: Line = [[-118.31, 34.18], [-118.30, 34.18]];
const westward: Line = [[-118.30, 34.18], [-118.31, 34.18]];
const northward: Line = [[-118.31, 34.18], [-118.31, 34.19]];
const southward: Line = [[-118.31, 34.19], [-118.31, 34.18]];
// Burbank's downtown grid is turned about 45 degrees from the compass.
const northeastward: Line = [[-118.31, 34.18], [-118.30, 34.19]];
const southwestward: Line = [[-118.30, 34.19], [-118.31, 34.18]];
const northwestward: Line = [[-118.30, 34.18], [-118.31, 34.19]];
const southeastward: Line = [[-118.31, 34.19], [-118.30, 34.18]];

const M_PER_DEG_LAT = 111_320;

/**
 * The compass point a drawn band lands on. Written from the definition, not from the build code:
 * MapLibre's positive line-offset shifts a line to the right of its direction of travel, a negative one to the left.
 * The line's direction is first to last coordinate; the band sits along the normal turned right or left of it.
 */
function compassOf(line: Line, offset: Offset): string {
  const [x0, y0] = line[0];
  const [x1, y1] = line[line.length - 1];
  const dx = (x1 - x0) * M_PER_DEG_LAT * Math.cos((y0 * Math.PI) / 180);
  const dy = (y1 - y0) * M_PER_DEG_LAT;
  const [nx, ny] = offset === 'right' ? [dy, -dx] : [-dy, dx];
  const bearing = (Math.atan2(nx, ny) * 180) / Math.PI; // clockwise from north
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[(Math.round(bearing / 45) + 8) % 8];
}

describe('sideToOffset', () => {
  it('maps L to left and R to right', () => {
    expect(sideToOffset('L')).toBe('left');
    expect(sideToOffset('R')).toBe('right');
  });

  it('rejects compass letters, lower case and anything else', () => {
    for (const bad of ['N', 'S', 'E', 'W', 'l', 'r', '', 'left']) {
      expect(() => sideToOffset(bad as never), bad).toThrow(/L or R/);
    }
  });
});

function segmentOn(id: string, line: Line): SegmentCollection['features'][number] {
  return {
    type: 'Feature',
    properties: { segment_id: id, street: 'Olive Avenue', from_street: 'A St', to_street: 'B St', city_id: 'testville' },
    geometry: { type: 'LineString', coordinates: line },
  };
}

const row = (r: Partial<Record<string, unknown>>) => ({
  segment_id: 'ew-1', side: 'L', layer: 'sweeping', type: null, limit_minutes: null, permit_code: null, color_key: null, schedule: null, ...r,
});

describe('bands land on the correct side of the street, whatever its direction', () => {
  // [name, line, where L lands, where R lands]
  const cases: [string, Line, string, string][] = [
    ['east-west, drawn west to east', eastward, 'N', 'S'],
    ['east-west, drawn east to west', westward, 'S', 'N'],
    ['north-south, drawn south to north', northward, 'W', 'E'],
    ['north-south, drawn north to south', southward, 'E', 'W'],
    ['diagonal, drawn toward the northeast', northeastward, 'NW', 'SE'],
    ['diagonal, drawn toward the southwest', southwestward, 'SE', 'NW'],
    ['diagonal, drawn toward the northwest', northwestward, 'SW', 'NE'],
    ['diagonal, drawn toward the southeast', southeastward, 'NE', 'SW'],
  ];

  for (const [name, line, left, right] of cases) {
    it(`${name}: L is ${left}, R is ${right}`, () => {
      const out = buildLayers(
        { type: 'FeatureCollection', features: [segmentOn('s', line)] },
        [row({ segment_id: 's', side: 'L' }), row({ segment_id: 's', side: 'R' })] as never,
        'testville',
      );
      const [l, r] = out.sweeping.features;
      expect(l.properties).toMatchObject({ side: 'L', offset: 'left' });
      expect(r.properties).toMatchObject({ side: 'R', offset: 'right' });
      expect(compassOf(l.geometry.coordinates, l.properties.offset)).toBe(left);
      expect(compassOf(r.geometry.coordinates, r.properties.offset)).toBe(right);
    });
  }

  it('a reversed segment puts the same row on the opposite curb', () => {
    const forward = segmentOn('fwd', eastward);
    const reversed = segmentOn('rev', [...eastward].reverse());
    const out = buildLayers(
      { type: 'FeatureCollection', features: [forward, reversed] },
      [row({ segment_id: 'fwd', side: 'L' }), row({ segment_id: 'rev', side: 'L' })] as never,
      'testville',
    );
    const [a, b] = out.sweeping.features;
    expect(compassOf(a.geometry.coordinates, a.properties.offset)).toBe('N');
    expect(compassOf(b.geometry.coordinates, b.properties.offset)).toBe('S');
  });

  it('uses the first and last coordinate, so a bent block keeps its sides', () => {
    const bent: Line = [[-118.31, 34.18], [-118.3099, 34.1801], [-118.30, 34.1802]];
    const out = buildLayers(
      { type: 'FeatureCollection', features: [segmentOn('s', bent)] },
      [row({ segment_id: 's', side: 'L' })] as never,
      'testville',
    );
    const f = out.sweeping.features[0];
    expect(compassOf(f.geometry.coordinates, f.properties.offset)).toBe('N');
  });
});

function segments(): SegmentCollection {
  return {
    type: 'FeatureCollection',
    features: [
      segmentOn('ew-1', eastward),
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

describe('buildLayers', () => {
  const out = buildLayers(
    segments(),
    [
      row({ side: 'L', layer: 'sweeping', schedule: sched }),
      row({ side: 'R', layer: 'timed_parking', limit_minutes: 120, permit_code: 'A' }),
      row({ segment_id: 'ns-1', side: 'R', layer: 'restrictions', type: 'no_stopping' }),
      row({ segment_id: 'ns-1', side: 'L', layer: 'curb_color', color_key: 'red' }),
      row({ segment_id: 'ns-1', side: 'L', layer: 'sweeping', schedule: sched }),
    ] as never,
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

  it('carries permit_mode on restriction features', () => {
    const r = buildLayers(
      segments(),
      [row({ layer: 'restrictions', type: 'no_parking', permit_code: 'A', permit_mode: 'required' })] as never,
      'testville',
    );
    expect(r.restrictions.features[0].properties).toMatchObject({ type: 'no_parking', permit_code: 'A', permit_mode: 'required' });
  });

  it('reads permit_mode from a CSV column, null when the cell or column is missing', () => {
    const withCol = parseRuleRows(
      'segment_id,side,layer,type,limit_minutes,permit_code,permit_mode,color_key,schedule\nns-1,L,restrictions,no_parking,,A,required,,\nns-1,R,restrictions,no_parking,,A,,,\n',
    );
    expect(withCol.map((r) => r.permit_mode)).toEqual(['required', null]);
    const without = parseRuleRows('segment_id,side,layer,type,limit_minutes,permit_code,color_key,schedule\nns-1,L,restrictions,no_parking,,A,,\n');
    expect(without[0].permit_mode).toBeNull();
  });

  it('computes the offset from the side alone', () => {
    const ew = out.sweeping.features.find((f) => f.properties.segment_id === 'ew-1')!;
    expect(ew.properties).toMatchObject({ side: 'L', offset: 'left', street: 'Olive Avenue', schedule: sched });
    expect(out.timedParking.features[0].properties).toMatchObject({ side: 'R', offset: 'right', limit_minutes: 120, permit_code: 'A' });
    expect(out.restrictions.features[0].properties).toMatchObject({ side: 'R', offset: 'right', type: 'no_stopping' });
    expect(out.curbColors.features[0].properties).toMatchObject({ side: 'L', offset: 'left', color_key: 'red' });
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

  it('names the row when a side is not L or R', () => {
    expect(() => buildLayers(segments(), [row({ side: 'E' })] as never, 'testville')).toThrow(/rules\.csv row 2.*ew-1.*L or R/);
  });
});
