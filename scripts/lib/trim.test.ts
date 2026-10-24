import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bandOffsetPx, bandWidthPx } from '../../src/layers/bands.ts';
import { buildTrim, bandReachMetres, type BandConfig } from './trim.ts';
import type { SegmentCollection } from './segments.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = JSON.parse(readFileSync(resolve(root, 'config', 'band-geometry.json'), 'utf8')) as BandConfig;

// A local grid in metres around a fixed point; 1 m north is 1/111320 degrees of latitude.
const LON0 = -118.3;
const LAT0 = 34.18;
const M_PER_DEG_LAT = 111_320;
const pt = (x: number, y: number): [number, number] => [
  LON0 + x / (M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180)),
  LAT0 + y / M_PER_DEG_LAT,
];
const seg = (id: string, ...points: [number, number][]) => ({
  type: 'Feature' as const,
  properties: { segment_id: id, street: 'Test St', from_street: null, to_street: null, city_id: 'testville' },
  geometry: { type: 'LineString' as const, coordinates: points.map(([x, y]) => pt(x, y)) },
});
const collection = (...features: ReturnType<typeof seg>[]): SegmentCollection => ({ type: 'FeatureCollection', features });

/** A point `d` metres from (x, y) at `deg` degrees anticlockwise from east. */
const polar = (x: number, y: number, deg: number, d: number): [number, number] => [
  x + d * Math.cos((deg * Math.PI) / 180),
  y + d * Math.sin((deg * Math.PI) / 180),
];

const reach = bandReachMetres(config);

describe('band config', () => {
  it('reaches about 3.5 m: the outer band edge of three 2 px bands at z17', () => {
    expect(reach).toBeGreaterThan(3.3);
    expect(reach).toBeLessThan(3.6);
  });

  it('is what the layers draw with: they read the same file', () => {
    for (let i = 0; i < config.band_count; i++) expect(bandOffsetPx(i)).toBe(config.first_offset_px + config.offset_step_px * i);
    expect(bandWidthPx()).toBe(Math.max(config.min_width_px, config.width_px));
  });
});

describe('trim at a 90 degree corner', () => {
  // A runs east into the corner at (100, 0); B runs north out of it.
  const trim = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [100, 0], [100, 100])), config);

  it('trims reach / tan(45 degrees) = reach at the corner end only', () => {
    expect(trim.segments.A.trim_end_m).toBeCloseTo(reach, 1);
    expect(trim.segments.A.trim_start_m).toBe(0);
    expect(trim.segments.B.trim_start_m).toBeCloseTo(reach, 1);
    expect(trim.segments.B.trim_end_m).toBe(0);
  });

  it('flags nothing else', () => {
    for (const id of ['A', 'B']) {
      expect(trim.segments[id]).toMatchObject({ sliver: false, inner_L: false, inner_R: false });
    }
  });

  it('records the city and stays within the cap', () => {
    expect(trim.city_id).toBe('testville');
    expect(reach).toBeLessThan(0.35 * 100);
  });
});

describe('trim on a straight street', () => {
  it('does not trim where two blocks continue in line, or at a dead end', () => {
    const trim = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [100, 0], [200, 0])), config);
    expect(trim.segments.A).toMatchObject({ trim_start_m: 0, trim_end_m: 0 });
    expect(trim.segments.B).toMatchObject({ trim_start_m: 0, trim_end_m: 0 });
  });

  it('uses the smallest angle when three blocks meet (a T)', () => {
    // A arrives from the west; B leaves north (90 degrees) and C leaves east (180 degrees).
    const trim = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [100, 0], [100, 100]), seg('C', [100, 0], [200, 0])), config);
    expect(trim.segments.A.trim_end_m).toBeCloseTo(reach, 1);
  });
});

describe('an acute fork that hits the cap', () => {
  // Trunk T from the west splits at (100, 0) into branches F1 and F2, 15 degrees apart.
  const fork = (branchLength: number) =>
    buildTrim(
      collection(
        seg('T', [0, 0], [100, 0]),
        seg('F1', [100, 0], polar(100, 0, 7.5, branchLength)),
        seg('F2', [100, 0], polar(100, 0, -7.5, branchLength)),
      ),
      config,
    );

  it('caps the branch trim at 35% of the block per end, where reach / tan(7.5 degrees) is far more', () => {
    const needed = reach / Math.tan((15 * Math.PI) / 180 / 2);
    expect(needed).toBeGreaterThan(0.35 * 60);
    const trim = fork(60);
    expect(trim.segments.F1.trim_start_m).toBeCloseTo(0.35 * 60, 1);
    expect(trim.segments.F2.trim_start_m).toBeCloseTo(0.35 * 60, 1);
    expect(trim.segments.F1.trim_end_m).toBe(0);
  });

  it('does not cap when the angle needs less than the cap', () => {
    const trim = fork(400);
    expect(trim.segments.F1.trim_start_m).toBeCloseTo(reach / Math.tan((15 * Math.PI) / 180 / 2), 1);
  });

  it('trims the trunk by the same smallest-angle rule (trunk to branch is 7.5 degrees off straight-on, so 172.5 apart)', () => {
    const trim = fork(400);
    // The trunk end points back west; its branches leave at +-7.5 degrees east of north-south axis: the angle is 172.5.
    expect(trim.segments.T.trim_end_m).toBeCloseTo(reach / Math.tan((172.5 * Math.PI) / 180 / 2), 1);
  });

  it('flags the facing sides of the two branches as inner', () => {
    const trim = fork(60);
    // F1 heads north-east of F2; facing along F1 the other branch is on its right, and F2 sees F1 on its left.
    expect(trim.segments.F1).toMatchObject({ inner_L: false, inner_R: true });
    expect(trim.segments.F2).toMatchObject({ inner_L: true, inner_R: false });
  });
});

describe('a sliver', () => {
  // Two long blocks 40 m apart joined by a 15 m cross link, forming an H turned on its side.
  //   A (west to east, y = 0)    C (west to east, y = 15)    S joins their middles... the link S is at x = 100.
  const fixture = () =>
    collection(
      seg('A1', [0, 0], [100, 0]),
      seg('A2', [100, 0], [200, 0]),
      seg('S', [100, 0], [100, 15]),
      seg('C1', [0, 15], [100, 15]),
      seg('C2', [100, 15], [200, 15]),
    );

  it('is flagged when under 20 m, and not when 20 m or more', () => {
    const trim = buildTrim(fixture(), config);
    expect(trim.segments.S.sliver).toBe(true);
    expect(trim.segments.A1.sliver).toBe(false);
    const longer = buildTrim(collection(seg('X', [0, 0], [20, 0]), seg('Y', [0, 0], [19.9, 0])), config);
    expect(longer.segments.X.sliver).toBe(false);
    expect(longer.segments.Y.sliver).toBe(true);
  });

  it('does not make its neighbours trim: with the sliver ignored the through street is straight', () => {
    const trim = buildTrim(fixture(), config);
    // Counting S, A1 and A2 would meet at 90 degrees and A1 would be trimmed by `reach`.
    expect(trim.segments.A1.trim_end_m).toBe(0);
    expect(trim.segments.A2.trim_start_m).toBe(0);
    expect(trim.segments.C1.trim_end_m).toBe(0);
  });

  it('does not mark its neighbours inner: the long blocks are 15 m apart and the sliver is ignored', () => {
    const near = buildTrim(
      collection(seg('A', [0, 0], [100, 0]), seg('B', [0, 8], [100, 8]), seg('S', [100, 0], [100, 8])),
      config,
    );
    expect(near.segments.S.sliver).toBe(true);
    // A and B are parallel and 8 m apart, so they are inner to each other, but S plays no part in that.
    expect(near.segments.A).toMatchObject({ inner_L: true, inner_R: false });
    expect(near.segments.B).toMatchObject({ inner_L: false, inner_R: true });
  });

  it('is not made inner by a block that only sits at its ends, and is still trimmed against the long blocks', () => {
    const trim = buildTrim(fixture(), config);
    expect(trim.segments.S.inner_L).toBe(false);
    expect(trim.segments.S.inner_R).toBe(false);
    // Against the through streets, which are non-slivers, the 90 degree rule gives `reach`, capped at 35% of 15 m.
    expect(trim.segments.S.trim_start_m).toBeCloseTo(Math.min(reach, 0.35 * 15), 1);
  });

  it('never counts a sliver as the other block of an inner pair', () => {
    // S runs alongside A, 6 m away, parallel. If S counted, A would be inner on that side.
    const trim = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('S', [10, 6], [25, 6])), config);
    expect(trim.segments.S.sliver).toBe(true);
    expect(trim.segments.A).toMatchObject({ inner_L: false, inner_R: false });
  });
});

describe('a dual carriageway', () => {
  // Eastbound E at y = -4 and westbound W at y = +4, 8 m apart, plus a street on each outer side.
  const trim = buildTrim(
    collection(
      seg('E', [0, -4], [200, -4]),
      seg('W', [200, 4], [0, 4]),
      seg('FAR_S', [0, -60], [200, -60]),
      seg('FAR_N', [0, 60], [200, 60]),
    ),
    config,
  );

  it('marks only the facing sides inner', () => {
    // E faces east, so its left is north (toward W). W faces west, so its left is south (toward E)... no: facing west, left is south.
    expect(trim.segments.E).toMatchObject({ inner_L: true, inner_R: false });
    expect(trim.segments.W).toMatchObject({ inner_L: true, inner_R: false });
  });

  it('leaves the outer sides unflagged, and streets 56 m away alone', () => {
    expect(trim.segments.E.inner_R).toBe(false);
    expect(trim.segments.W.inner_R).toBe(false);
    expect(trim.segments.FAR_S).toMatchObject({ inner_L: false, inner_R: false });
    expect(trim.segments.FAR_N).toMatchObject({ inner_L: false, inner_R: false });
  });

  it('gives a carriageway with the same direction as its neighbour the same answer', () => {
    const same = buildTrim(collection(seg('E1', [0, -4], [200, -4]), seg('E2', [0, 4], [200, 4])), config);
    expect(same.segments.E1).toMatchObject({ inner_L: true, inner_R: false });
    expect(same.segments.E2).toMatchObject({ inner_L: false, inner_R: true });
  });

  it('ignores a block more than 10 m away, one at 10 m exactly counts, and one past 25 degrees does not', () => {
    const far = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [0, 10.5], [100, 10.5])), config);
    expect(far.segments.A).toMatchObject({ inner_L: false, inner_R: false });
    const edge = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [0, 10], [100, 10])), config);
    expect(edge.segments.A).toMatchObject({ inner_L: true });
    // B leans 30 degrees away from A: parallel only within 25.
    const steep = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [0, 5], polar(0, 5, 30, 100))), config);
    expect(steep.segments.A).toMatchObject({ inner_L: false, inner_R: false });
  });

  it('does not flag a side for a block that meets it at a right angle', () => {
    const t = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [100, 0], [100, 100])), config);
    expect(t.segments.A).toMatchObject({ inner_L: false, inner_R: false });
  });
});

describe('output shape', () => {
  it('has one entry per segment and rounds metres to two decimals', () => {
    const trim = buildTrim(collection(seg('A', [0, 0], [100, 0]), seg('B', [100, 0], [100, 100])), config);
    expect(Object.keys(trim.segments).sort()).toEqual(['A', 'B']);
    expect(Number.isInteger(trim.segments.A.trim_end_m * 100)).toBe(true);
  });

  it('is repeatable', () => {
    const input = collection(seg('A', [0, 0], [100, 0]), seg('B', [100, 0], [100, 100]));
    expect(JSON.stringify(buildTrim(input, config))).toBe(JSON.stringify(buildTrim(input, config)));
  });
});

describe('the committed trim.json', () => {
  it('is in step with the frozen segments file and the band config; run `DATA_SET=real npm run build:data` if this fails', () => {
    const segments = JSON.parse(readFileSync(resolve(root, 'data', 'burbank', 'segments.geojson'), 'utf8')) as SegmentCollection;
    const committed = readFileSync(resolve(root, 'data', 'burbank', 'trim.json'), 'utf8');
    expect(JSON.parse(committed)).toEqual(JSON.parse(JSON.stringify(buildTrim(segments, config))));
  });
});
