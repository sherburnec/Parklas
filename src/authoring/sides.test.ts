// Task M2-7: the side the authoring page marks as L is the side the build script draws for L.
import { describe, expect, it } from 'vitest';
import { buildLayers, type Line, type Offset, type SegmentCollection } from '../../scripts/lib/build';
import { authoringSides } from './sides';

// Burbank latitude, so a degree of longitude is shorter than a degree of latitude.
const eastward: Line = [[-118.31, 34.18], [-118.30, 34.18]];
const westward: Line = [[-118.30, 34.18], [-118.31, 34.18]];

const M_PER_DEG_LAT = 111_320;

/**
 * The compass point a band offset toward `offset` lands on. Written from the definition, not from the code under test:
 * left of the direction of travel (first to last coordinate) is the normal turned anticlockwise, right is clockwise.
 */
function compassOf(line: Line, offset: Offset): string {
  const [x0, y0] = line[0];
  const [x1, y1] = line[line.length - 1];
  const dx = (x1 - x0) * M_PER_DEG_LAT * Math.cos((y0 * Math.PI) / 180);
  const dy = (y1 - y0) * M_PER_DEG_LAT;
  const [nx, ny] = offset === 'right' ? [dy, -dx] : [-dy, dx];
  const bearing = (Math.atan2(nx, ny) * 180) / Math.PI;
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[(Math.round(bearing / 45) + 8) % 8];
}

function segmentOn(id: string, line: Line): SegmentCollection['features'][number] {
  return {
    type: 'Feature',
    properties: { segment_id: id, street: 'Olive Avenue', from_street: 'A St', to_street: 'B St', city_id: 'testville' },
    geometry: { type: 'LineString', coordinates: line },
  };
}

/** The offset the build script draws for `side` on this segment. */
function builtOffset(line: Line, side: 'L' | 'R'): Offset {
  const segments: SegmentCollection = { type: 'FeatureCollection', features: [segmentOn('s1', line)] };
  const rows = [{ segment_id: 's1', side, layer: 'sweeping' as const, type: null, limit_minutes: null, permit_code: null, color_key: null, schedule: null }];
  return buildLayers(segments, rows, 'testville').sweeping.features[0].properties.offset;
}

describe('authoring page sides agree with the build script', () => {
  const cases: [string, Line, string, string][] = [
    ['a normal segment (eastward)', eastward, 'N', 'S'],
    ['the same street reversed (westward)', westward, 'S', 'N'],
  ];

  it.each(cases)('%s', (_name, line, lCompass, rCompass) => {
    const sides = authoringSides();
    const marked = Object.fromEntries(sides.map((s) => [s.side, s]));

    // The page marks L and R, and each lands where the definition says.
    expect(compassOf(line, marked.L.offset)).toBe(lCompass);
    expect(compassOf(line, marked.R.offset)).toBe(rCompass);

    // And it is the side the build script draws for the same rows.
    expect(marked.L.offset).toBe(builtOffset(line, 'L'));
    expect(marked.R.offset).toBe(builtOffset(line, 'R'));
    expect(compassOf(line, builtOffset(line, 'L'))).toBe(lCompass);
  });

  it('flips L and R when the same street is reversed', () => {
    const forward = Object.fromEntries(authoringSides().map((s) => [s.side, compassOf(eastward, s.offset)]));
    const reversed = Object.fromEntries(authoringSides().map((s) => [s.side, compassOf(westward, s.offset)]));
    expect(forward.L).toBe(reversed.R);
    expect(forward.R).toBe(reversed.L);
  });

  it('uses the MapLibre sign: -1 for left, +1 for right', () => {
    const sides = authoringSides();
    expect(sides.find((s) => s.side === 'L')?.sgn).toBe(-1);
    expect(sides.find((s) => s.side === 'R')?.sgn).toBe(1);
  });
});
