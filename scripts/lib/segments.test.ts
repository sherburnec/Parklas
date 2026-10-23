import { describe, expect, it } from 'vitest';
import {
  buildSegments,
  diffSegments,
  findBlocksCrossingIntersections,
  isCurbRoad,
  type OsmElement,
  type SegmentCollection,
} from './segments.ts';

// Nodes sit on a small grid so coordinates are easy to reason about.
const node = (id: number, x: number, y: number): OsmElement => ({
  type: 'node',
  id,
  lon: -118.3 + x * 0.001,
  lat: 34.18 + y * 0.001,
});
const way = (
  id: number,
  nodes: number[],
  name: string | undefined,
  highway = 'residential',
): OsmElement => ({
  type: 'way',
  id,
  nodes,
  tags: { highway, ...(name ? { name } : {}) },
});

const ids = (fc: SegmentCollection) => fc.features.map((f) => f.properties.segment_id);
const byStreet = (fc: SegmentCollection, street: string) =>
  fc.features.filter((f) => f.properties.street === street);

describe('isCurbRoad', () => {
  it('keeps streets that have curbs', () => {
    for (const hw of ['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']) {
      expect(isCurbRoad({ highway: hw, name: 'X St' })).toBe(true);
    }
  });

  it('skips motorways, ramps, footpaths, service alleys and unnamed ways', () => {
    for (const hw of ['motorway', 'motorway_link', 'trunk_link', 'primary_link', 'footway', 'path', 'cycleway', 'service', 'track', 'steps']) {
      expect(isCurbRoad({ highway: hw, name: 'X St' })).toBe(false);
    }
    expect(isCurbRoad({ highway: 'residential' })).toBe(false);
    expect(isCurbRoad({ name: 'X St' })).toBe(false);
    expect(isCurbRoad({ highway: 'residential', name: 'X St', area: 'yes' })).toBe(false);
  });
});

describe('buildSegments', () => {
  // Olive runs west-east (1-2-3-4-5), Third runs south-north (6-7-3-8-9); they cross at node 3.
  const crossing: OsmElement[] = [
    node(1, 0, 2), node(2, 1, 2), node(3, 2, 2), node(4, 3, 2), node(5, 4, 2),
    node(6, 2, 0), node(7, 2, 1), node(8, 2, 3), node(9, 2, 4),
    way(100, [1, 2, 3, 4, 5], 'Olive Ave'),
    way(200, [6, 7, 3, 8, 9], 'Third St'),
  ];

  it('splits at the intersection and nowhere else', () => {
    const fc = buildSegments(crossing, 'burbank');
    expect(fc.features).toHaveLength(4);
    for (const f of fc.features) expect(f.geometry.coordinates).toHaveLength(3);
    expect(findBlocksCrossingIntersections(fc)).toEqual([]);
  });

  it('names cross streets and sets city_id', () => {
    const fc = buildSegments(crossing, 'burbank');
    for (const f of byStreet(fc, 'Olive Ave')) {
      expect(f.properties.city_id).toBe('burbank');
      // One end meets Third St, the other is a dead end.
      expect([f.properties.from_street, f.properties.to_street].filter((s) => s === 'Third St')).toHaveLength(1);
      expect([f.properties.from_street, f.properties.to_street].filter((s) => s === null)).toHaveLength(1);
    }
  });

  it('splits a long way where another street ends on it (T junction)', () => {
    const fc = buildSegments(
      [
        node(1, 0, 0), node(2, 1, 0), node(3, 2, 0), node(4, 3, 0), node(5, 1, 1),
        way(1, [1, 2, 3, 4], 'Main St'),
        way(2, [5, 2], 'Side St'),
      ],
      'burbank',
    );
    const main = byStreet(fc, 'Main St');
    expect(main).toHaveLength(2);
    expect(main.every((f) => f.properties.from_street === 'Side St' || f.properties.to_street === 'Side St')).toBe(true);
    expect(findBlocksCrossingIntersections(fc)).toEqual([]);
  });

  it('joins a street that OSM stored as several ways', () => {
    const fc = buildSegments(
      [node(1, 0, 0), node(2, 1, 0), node(3, 2, 0), way(1, [1, 2], 'Main St'), way(2, [2, 3], 'Main St')],
      'burbank',
    );
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toHaveLength(3);
  });

  it('splits where the street changes name', () => {
    const fc = buildSegments(
      [node(1, 0, 0), node(2, 1, 0), node(3, 2, 0), way(1, [1, 2], 'Main St'), way(2, [2, 3], 'Other Blvd')],
      'burbank',
    );
    expect(fc.features).toHaveLength(2);
    expect(byStreet(fc, 'Main St')[0].properties.to_street).toBe('Other Blvd');
    expect(byStreet(fc, 'Other Blvd')[0].properties.from_street).toBe('Main St');
  });

  it('ignores alleys, footpaths and ramps when finding intersections', () => {
    const fc = buildSegments(
      [
        node(1, 0, 0), node(2, 1, 0), node(3, 2, 0), node(4, 1, 1), node(5, 1, 2),
        way(1, [1, 2, 3], 'Main St'),
        way(2, [4, 2], undefined, 'service'),
        way(3, [5, 2], 'Path', 'footway'),
      ],
      'burbank',
    );
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.from_street).toBeNull();
    expect(fc.features[0].properties.to_street).toBeNull();
  });

  it('gives ids that do not depend on input order or way direction', () => {
    const a = buildSegments(crossing, 'burbank');
    const flipped = crossing
      .map((e) => (e.type === 'way' ? { ...e, nodes: [...e.nodes].reverse() } : e))
      .reverse();
    const b = buildSegments(flipped, 'burbank');
    expect(ids(b)).toEqual(ids(a));
    expect(b.features.map((f) => f.geometry.coordinates)).toEqual(a.features.map((f) => f.geometry.coordinates));
    expect(new Set(ids(a)).size).toBe(ids(a).length);
    expect(ids(a).every((id) => id.startsWith('burbank-'))).toBe(true);
  });

  it('gives parallel blocks between the same two intersections different ids', () => {
    const fc = buildSegments(
      [
        node(1, 0, 0), node(2, 2, 0), node(3, 1, 1), node(4, 1, -1), node(5, -1, 0), node(6, 3, 0),
        way(1, [1, 3, 2], 'Loop Rd'),
        way(2, [1, 4, 2], 'Loop Rd'),
        way(3, [5, 1], 'West St'),
        way(4, [2, 6], 'East St'),
      ],
      'burbank',
    );
    expect(byStreet(fc, 'Loop Rd')).toHaveLength(2);
    expect(new Set(ids(fc)).size).toBe(4);
  });

  it('keeps a cul-de-sac ring as its own block', () => {
    const fc = buildSegments(
      [
        node(1, 0, 0), node(2, 1, 0), node(3, 2, 0), node(4, 2, 1), node(5, 1, 1),
        way(1, [1, 2], 'Court St'),
        way(2, [2, 3, 4, 5, 2], 'Court St'),
      ],
      'burbank',
    );
    expect(fc.features).toHaveLength(2);
    expect(findBlocksCrossingIntersections(fc)).toEqual([]);
  });

  it('keeps a standalone ring', () => {
    const fc = buildSegments(
      [node(1, 0, 0), node(2, 1, 0), node(3, 1, 1), way(1, [1, 2, 3, 1], 'Circle Dr')],
      'burbank',
    );
    expect(fc.features).toHaveLength(1);
  });
});

const line = (id: string, street: string, coordinates: [number, number][]) => ({
  type: 'Feature' as const,
  properties: { segment_id: id, street, from_street: null, to_street: null, city_id: 'burbank' },
  geometry: { type: 'LineString' as const, coordinates },
});
const collection = (...features: ReturnType<typeof line>[]): SegmentCollection => ({
  type: 'FeatureCollection',
  features,
});

describe('findBlocksCrossingIntersections', () => {
  it('flags a block whose interior touches another block', () => {
    const fc = collection(
      line('a', 's', [[0, 0], [1, 0], [2, 0]]),
      line('b', 't', [[1, 1], [1, 0]]),
    );
    expect(findBlocksCrossingIntersections(fc)).toEqual(['a']);
  });
});

describe('diffSegments', () => {
  it('reports added, removed and changed ids', () => {
    const before = collection(
      line('a', 'Main', [[0, 0], [1, 1]]),
      line('b', 'Main', [[1, 1], [2, 2]]),
      line('c', 'Main', [[2, 2], [3, 3]]),
    );
    const after = collection(
      line('a', 'Main', [[0, 0], [1, 1]]),
      line('b', 'Renamed', [[1, 1], [2, 2]]),
      line('d', 'Main', [[3, 3], [4, 4]]),
    );
    expect(diffSegments(before, after)).toEqual({ added: ['d'], removed: ['c'], changed: ['b'] });
  });

  it('reports nothing when identical', () => {
    const same = collection(line('a', 'Main', [[0, 0], [1, 1]]));
    expect(diffSegments(same, same)).toEqual({ added: [], removed: [], changed: [] });
  });
});
