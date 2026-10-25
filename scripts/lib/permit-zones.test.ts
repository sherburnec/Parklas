import { describe, expect, it } from 'vitest';
import { findOverlaps, permitZoneAt, permitZonesAtEnds, sidePointAt, type PermitZones } from './permit-zones.ts';

type Line = [number, number][];

const rect = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const zone = (code: string, coordinates: number[][][]) => ({
  properties: { permit_code: code },
  geometry: { type: 'Polygon' as const, coordinates },
});
const zones = (...z: ReturnType<typeof zone>[]): PermitZones => ({ features: z });

// Burbank latitude. A street along y = 34.18, drawn west to east: L is the north side, R the south side.
const street: Line = [[-118.31, 34.18], [-118.30, 34.18]];
const reversed: Line = [[-118.30, 34.18], [-118.31, 34.18]];

// North of the street is zone A, south of it zone B: the street is their shared border.
const northA = zone('A', rect(-118.32, 34.18, -118.29, 34.19));
const southB = zone('B', rect(-118.32, 34.17, -118.29, 34.18));

describe('sidePointAt', () => {
  it('sits a few metres off the middle of the block, toward the left or right side', () => {
    const [lx, ly] = sidePointAt(street, 'L');
    const [rx, ry] = sidePointAt(street, 'R');
    expect(lx).toBeCloseTo(-118.305, 6);
    expect(rx).toBeCloseTo(-118.305, 6);
    expect(ly).toBeGreaterThan(34.18);
    expect(ry).toBeLessThan(34.18);
    expect((ly - 34.18) * 111000).toBeCloseTo(4, 1);
  });

  it('flips with the segment direction', () => {
    expect(sidePointAt(reversed, 'L')[1]).toBeLessThan(34.18);
    expect(sidePointAt(reversed, 'R')[1]).toBeGreaterThan(34.18);
  });

  it('measures the middle along the line, not by coordinate count', () => {
    const bent: Line = [[-118.31, 34.18], [-118.309, 34.18], [-118.30, 34.18]];
    expect(sidePointAt(bent, 'L')[0]).toBeCloseTo(-118.305, 6);
  });
});

describe('permitZoneAt', () => {
  it('finds the zone a side lies inside', () => {
    const inside = zones(zone('C', rect(-118.32, 34.17, -118.29, 34.19)));
    expect(permitZoneAt(street, 'L', inside)).toBe('C');
    expect(permitZoneAt(street, 'R', inside)).toBe('C');
  });

  it('puts the two sides of a street on a zone border in different zones', () => {
    const both = zones(northA, southB);
    expect(permitZoneAt(street, 'L', both)).toBe('A');
    expect(permitZoneAt(street, 'R', both)).toBe('B');
    // Reversing the block swaps the sides but not the zones.
    expect(permitZoneAt(reversed, 'L', both)).toBe('B');
    expect(permitZoneAt(reversed, 'R', both)).toBe('A');
  });

  it('gives null for a side outside every zone', () => {
    expect(permitZoneAt(street, 'L', zones(zone('Z', rect(-118.20, 34.10, -118.19, 34.11))))).toBeNull();
    expect(permitZoneAt(street, 'L', zones())).toBeNull();
  });

  it('gives null for the side that is outside when only one side is in a zone', () => {
    expect(permitZoneAt(street, 'L', zones(northA))).toBe('A');
    expect(permitZoneAt(street, 'R', zones(northA))).toBeNull();
  });

  it('ignores a hole in a polygon', () => {
    const ring = rect(-118.32, 34.17, -118.29, 34.19)[0];
    const hole = rect(-118.307, 34.18, -118.303, 34.1805)[0];
    expect(permitZoneAt(street, 'L', zones(zone('H', [ring, hole])))).toBeNull();
    expect(permitZoneAt(street, 'R', zones(zone('H', [ring, hole])))).toBe('H');
  });
});

describe('permitZonesAtEnds', () => {
  it('reads the zone near each end of a side', () => {
    const west = zone('A', rect(-118.32, 34.17, -118.305, 34.19));
    const east = zone('B', rect(-118.305, 34.17, -118.29, 34.19));
    expect(permitZonesAtEnds(street, 'L', zones(west, east))).toEqual({ start: 'A', end: 'B' });
  });

  it('agrees at both ends when the block lies in one zone', () => {
    expect(permitZonesAtEnds(street, 'L', zones(northA))).toEqual({ start: 'A', end: 'A' });
  });
});

describe('findOverlaps', () => {
  it('accepts zones that share a border', () => {
    expect(findOverlaps(zones(northA, southB))).toEqual([]);
  });

  it('accepts zones far apart', () => {
    expect(findOverlaps(zones(zone('A', rect(0, 0, 1, 1)), zone('B', rect(5, 5, 6, 6))))).toEqual([]);
  });

  it('rejects zones whose edges cross', () => {
    expect(findOverlaps(zones(zone('A', rect(0, 0, 2, 2)), zone('B', rect(1, 1, 3, 3))))).toEqual([{ first: 0, second: 1 }]);
  });

  it('rejects a zone lying wholly inside another', () => {
    expect(findOverlaps(zones(zone('A', rect(0, 0, 4, 4)), zone('B', rect(1, 1, 2, 2))))).toEqual([{ first: 0, second: 1 }]);
  });

  it('rejects two identical zones', () => {
    expect(findOverlaps(zones(zone('A', rect(0, 0, 1, 1)), zone('B', rect(0, 0, 1, 1))))).toEqual([{ first: 0, second: 1 }]);
  });

  it('rejects a zone that sits inside another and touches its edge', () => {
    expect(findOverlaps(zones(zone('A', rect(0, 0, 4, 4)), zone('B', rect(0, 0, 2, 2))))).toEqual([{ first: 0, second: 1 }]);
  });

  it('reports every overlapping pair', () => {
    const found = findOverlaps(zones(zone('A', rect(0, 0, 2, 2)), zone('B', rect(1, 1, 3, 3)), zone('C', rect(2.5, 2.5, 4, 4))));
    expect(found).toEqual([{ first: 0, second: 1 }, { first: 1, second: 2 }]);
  });
});
