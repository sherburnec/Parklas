import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BURBANK_GRID, classifySegments, orientSegments, type CityGrid } from './orientation.ts';
import type { SegmentCollection, SegmentFeature } from './segments.ts';

// Test grids sit on the Burbank origin, with coordinates written in metres east and north of it.
const ORIGIN: [number, number] = [-118.31, 34.18];
const M_PER_DEG = 111_320;
const at = (x: number, y: number): [number, number] => [
  ORIGIN[0] + x / (M_PER_DEG * Math.cos((ORIGIN[1] * Math.PI) / 180)),
  ORIGIN[1] + y / M_PER_DEG,
];
// City east at a compass bearing of 45 degrees, so city north is 315 (top left) and the axes are easy to write.
const grid: CityGrid = { origin: ORIGIN, eastBearing: 45, baseStreets: ['Olive Avenue', 'East Olive Avenue', 'West Olive Avenue'] };
// A point `e` metres city-east and `n` metres city-north of the origin.
const g = (e: number, n: number) => at((e - n) * Math.SQRT1_2, (e + n) * Math.SQRT1_2);

const seg = (id: string, street: string, line: [number, number][], from = 'From', to = 'To'): SegmentFeature => ({
  type: 'Feature',
  properties: { segment_id: id, street, from_street: from, to_street: to, city_id: 'burbank' },
  geometry: { type: 'LineString', coordinates: line },
});
const fc = (...features: SegmentFeature[]): SegmentCollection => ({ type: 'FeatureCollection', features });
const byId = (c: SegmentCollection, id: string) => c.features.find((f) => f.properties.segment_id === id)!;

// Olive runs along the city-east axis through the origin, in both directions.
const olive = [
  seg('o1', 'East Olive Avenue', [g(0, 0), g(200, 0)]),
  seg('o2', 'West Olive Avenue', [g(0, 0), g(-200, 0)]),
];

describe('orientSegments: Olive Avenue', () => {
  it('runs East Olive toward the top right and the rest of Olive toward the bottom left, both away from the origin', () => {
    const input = fc(
      seg('e', 'East Olive Avenue', [g(400, 0), g(200, 0)]),
      seg('w', 'West Olive Avenue', [g(-400, 0), g(-200, 0)]),
      seg('o', 'Olive Avenue', [g(-800, 0), g(-600, 10)]),
    );
    const { collection, reversed } = orientSegments(input, grid);
    expect(reversed).toEqual(['e', 'o', 'w']);
    expect(byId(collection, 'e').geometry.coordinates).toEqual([g(200, 0), g(400, 0)]);
    expect(byId(collection, 'w').geometry.coordinates).toEqual([g(-200, 0), g(-400, 0)]);
    expect(byId(collection, 'o').geometry.coordinates).toEqual([g(-600, 10), g(-800, 0)]);
  });

  it('judges north and south of Olive by its line through the origin, so a bend at its far end moves nothing', () => {
    const bend = seg('b', 'Olive Avenue', [g(-900, 0), g(-1000, 300)]);
    const beyond = seg('c', 'Clybourn Avenue', [g(-1200, 100), g(-1200, -50)]);
    const named = seg('n', 'North Clybourn Avenue', [g(-1200, 300), g(-1200, 100)]);
    expect(classifySegments(fc(...olive, bend, beyond, named), grid).get('c')).toEqual({ axis: 'ns', side: 1 });
  });

  it('treats a bend in Olive as Olive, never as a North/South street', () => {
    // Olive's far end turns 80 degrees toward city north, west of the origin: it still runs away from the origin.
    const bend = seg('b', 'Olive Avenue', [g(-900, 300), g(-880, 0)]);
    const { collection } = orientSegments(fc(...olive, bend), grid);
    expect(byId(collection, 'b').geometry.coordinates).toEqual([g(-880, 0), g(-900, 300)]);
  });
});

describe('orientSegments: North/South streets run outward from Olive', () => {
  it('points North streets toward city north and South streets toward city south', () => {
    const input = fc(
      ...olive,
      seg('n1', 'North First Street', [g(50, 200), g(50, 0)]),
      seg('n2', 'North First Street', [g(50, 200), g(50, 400)]),
      seg('s1', 'South First Street', [g(50, -200), g(50, 0)]),
      seg('s2', 'South Lake Street', [g(-150, -200), g(-150, -400)]),
    );
    const { collection, reversed } = orientSegments(input, grid);
    expect(reversed).toEqual(['n1', 's1']);
    expect(byId(collection, 'n1').geometry.coordinates).toEqual([g(50, 0), g(50, 200)]);
    expect(byId(collection, 's1').geometry.coordinates).toEqual([g(50, 0), g(50, -200)]);
  });

  it('gives an unprefixed street the class of the same street’s prefixed blocks, and its side from Olive', () => {
    const input = fc(
      ...olive,
      seg('v1', 'North Victory Boulevard', [g(100, 0), g(100, 200)]),
      // Victory with no prefix, south of Olive and west of the origin, slanting 51 degrees toward city west.
      // By angle alone it is East/West and already points west; as Victory it is North/South and must point south.
      seg('v2', 'Victory Boulevard', [g(-100, -200), g(-350, 0)]),
    );
    expect(classifySegments(input, grid).get('v2')).toEqual({ axis: 'ns', side: -1 });
    const { collection, reversed } = orientSegments(input, grid);
    expect(reversed).toEqual(['v2']);
    expect(byId(collection, 'v2').geometry.coordinates).toEqual([g(-350, 0), g(-100, -200)]);
  });
});

describe('orientSegments: other East/West streets run like Olive', () => {
  it('points East streets toward city east and West streets toward city west', () => {
    const input = fc(
      ...olive,
      seg('e1', 'East Orange Grove Avenue', [g(300, 200), g(100, 200)]),
      seg('w1', 'West Orange Grove Avenue', [g(-100, 200), g(-300, 200)]),
    );
    const { collection, reversed } = orientSegments(input, grid);
    expect(reversed).toEqual(['e1']);
    expect(byId(collection, 'e1').geometry.coordinates).toEqual([g(100, 200), g(300, 200)]);
  });

  it('takes an unprefixed East/West street’s side from the east-west divider through the origin', () => {
    const input = fc(
      ...olive,
      seg('a', 'Magnolia Boulevard', [g(-500, 600), g(-300, 600)]),
      seg('b', 'Magnolia Boulevard', [g(500, 600), g(300, 600)]),
    );
    const { collection, reversed } = orientSegments(input, grid);
    expect(reversed).toEqual(['a', 'b']);
    expect(byId(collection, 'a').geometry.coordinates).toEqual([g(-300, 600), g(-500, 600)]);
  });
});

describe('classifySegments: the local grid for unprefixed streets', () => {
  // City east at 40 degrees here, so city north is 310. Out west the prefixed North streets run due compass north,
  // 50 degrees off the downtown grid: an unprefixed street parallel to them is North/South, though the downtown
  // angle alone would call it East/West.
  const tilted: CityGrid = { ...grid, eastBearing: 40 };
  const west = (x: number, y: number) => at(-3000 + x, 1000 + y);
  const input = fc(
    seg('o', 'West Olive Avenue', [at(0, 0), at(-4000, -3000)]),
    seg('p1', 'North Naomi Street', [west(0, 0), west(0, 200)]),
    seg('p2', 'North Naomi Street', [west(0, 200), west(0, 400)]),
    seg('p3', 'North Manning Street', [west(150, 0), west(150, 200)]),
    seg('q1', 'West Clark Avenue', [west(0, 0), west(150, 0)]),
    seg('u', 'Kenneth Road', [west(300, 0), west(307, 200)]),
    seg('x', 'Hollywood Way', [west(450, 200), west(450, 0)]),
  );

  it('uses the angle of nearby prefixed blocks', () => {
    expect(classifySegments(input, tilted).get('u')).toEqual({ axis: 'ns', side: 1 });
  });

  it('gives every connected block of one unprefixed street the axis most of its length has', () => {
    // A short kink that, judged alone, runs East/West stays North/South like the rest of Kenneth Road.
    const kinked = fc(
      ...input.features,
      seg('u2', 'Kenneth Road', [west(307, 200), west(300, 400)]),
      seg('u3', 'Kenneth Road', [west(300, 400), west(340, 410)]),
    );
    const c = classifySegments(kinked, tilted);
    expect(['u', 'u2', 'u3'].map((id) => c.get(id)!.axis)).toEqual(['ns', 'ns', 'ns']);
  });

  it('sends the unprefixed street north, away from Olive', () => {
    const { collection } = orientSegments(input, tilted);
    expect(byId(collection, 'u').geometry.coordinates).toEqual([west(300, 0), west(307, 200)]);
  });

  it('reads the prefix first: North/South and East/West, with the side it names', () => {
    const c = classifySegments(input, tilted);
    expect(c.get('p1')).toEqual({ axis: 'ns', side: 1 });
    expect(c.get('q1')).toEqual({ axis: 'ew', side: -1 });
    expect(c.get('o')).toEqual({ axis: 'ew', side: -1 });
  });
});

describe('orientSegments: what changes and what does not', () => {
  const input = fc(...olive, seg('n', 'North First Street', [g(50, 200), g(52, 100), g(50, 0)], 'Orange Grove', 'Olive'));

  it('keeps the id, reverses every coordinate and swaps the cross streets of a reversed block', () => {
    const f = byId(orientSegments(input, grid).collection, 'n');
    expect(f.properties).toEqual({ segment_id: 'n', street: 'North First Street', from_street: 'Olive', to_street: 'Orange Grove', city_id: 'burbank' });
    expect(f.geometry.coordinates).toEqual([g(50, 0), g(52, 100), g(50, 200)]);
  });

  it('keeps feature order and leaves the input untouched', () => {
    const before = JSON.stringify(input);
    const { collection } = orientSegments(input, grid);
    expect(JSON.stringify(input)).toBe(before);
    expect(collection.features.map((f) => f.properties.segment_id)).toEqual(['o1', 'o2', 'n']);
  });

  it('is stable: orienting an oriented file reverses nothing', () => {
    const once = orientSegments(input, grid).collection;
    expect(orientSegments(once, grid).reversed).toEqual([]);
  });

  it('leaves closed loops as they are, since they have no direction', () => {
    const loop = seg('loop', 'North Loop Lane', [g(0, 100), g(50, 150), g(0, 200), g(0, 100)]);
    expect(orientSegments(fc(...olive, loop), grid).reversed).toEqual([]);
  });
});

describe('the frozen Burbank segments file (task M5-6)', () => {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/burbank/segments.geojson');
  const real = JSON.parse(readFileSync(file, 'utf8')) as SegmentCollection;
  const [east, north] = [Math.sin((BURBANK_GRID.eastBearing * Math.PI) / 180), Math.cos((BURBANK_GRID.eastBearing * Math.PI) / 180)];
  const travel = (f: SegmentFeature) => {
    const [a, b] = [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)!];
    const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
    const dy = b[1] - a[1];
    return { e: dx * east + dy * north, n: dy * east - dx * north };
  };

  it('is already oriented by the Burbank grid', () => {
    expect(orientSegments(real, BURBANK_GRID).reversed).toEqual([]);
  });

  it('points every prefixed block the way its prefix says', () => {
    const wrong = real.features.filter((f) => {
      const t = travel(f);
      const prefix = f.properties.street.split(' ')[0];
      if (f.geometry.coordinates[0].join() === f.geometry.coordinates.at(-1)!.join()) return false;
      return (prefix === 'North' && t.n <= 0) || (prefix === 'South' && t.n >= 0) || (prefix === 'East' && t.e <= 0) || (prefix === 'West' && t.e >= 0);
    });
    expect(wrong.map((f) => `${f.properties.segment_id} ${f.properties.street}`)).toEqual([]);
  });

  it('runs Olive away from the West/East Olive split', () => {
    const olive = real.features.filter((f) => BURBANK_GRID.baseStreets.includes(f.properties.street));
    expect(olive.length).toBeGreaterThan(50);
    const toward = olive.filter((f) => {
      const d = (p: number[]) => Math.hypot((p[0] - BURBANK_GRID.origin[0]) * Math.cos((p[1] * Math.PI) / 180), p[1] - BURBANK_GRID.origin[1]);
      return d(f.geometry.coordinates.at(-1)!) <= d(f.geometry.coordinates[0]);
    });
    expect(toward.map((f) => f.properties.segment_id)).toEqual([]);
  });

  it('starts East Olive at the split node, just south of Front Street', () => {
    const first = real.features.find((f) => f.properties.segment_id === 'burbank-19668343-10052883300')!;
    expect(first.properties.street).toBe('East Olive Avenue');
    expect(first.geometry.coordinates[0]).toEqual(BURBANK_GRID.origin);
  });
});
