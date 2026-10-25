// Pure logic for the sample permit zones (task TD-8). No file I/O here: the CLI reads and writes the files.
//
// The frozen segments file is split at every intersection, so the streets form a planar graph. Its faces are the city
// blocks. A permit zone is a group of touching blocks, so its border runs exactly along street lines, and two zones
// that grow up against each other share a border without gaps or overlaps (a block belongs to at most one zone).
// Zones are grown from seed blocks in the residential zoning cells, one per cell, with DEMO-B grown against DEMO-A.
import type { SegmentCollection } from './build.ts';
import { mulberry32, SAMPLE_SEED } from './sample-data.ts';
import type { ZoningCollection } from './sample-zoning.ts';

const ZONE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const MIN_SEED_M2 = 8000; // seed blocks are ordinary blocks, not slivers
const MAX_BLOCK_M2 = 150000; // larger faces are hills, rail yards and the like
const MIN_SEPARATION_M = 1600; // seeds of zones that are not meant to touch are at least this far apart, so zones sit in different parts of the city
const MIN_BLOCKS = 7;
const EXTRA_BLOCKS = 6; // a zone gets MIN_BLOCKS plus up to this many
const OTHER_ZONING_SHARE = 0.25; // at most this share of a zone's blocks may lie outside residential zoning
const M_PER_DEG_X = 92000; // Burbank's latitude
const M_PER_DEG_Y = 111000;

type Pt = number[];

type HalfEdge = { from: number; to: number; pts: Pt[]; angle: number };
type Face = { edges: number[]; area: number; cx: number; cy: number };

const toM = (p: Pt): Pt => [p[0] * M_PER_DEG_X, p[1] * M_PER_DEG_Y];

/** The street network as half-edges (edge 2i runs first to last coordinate of segment i, edge 2i + 1 the other way) and its faces. */
function buildBlocks(segments: SegmentCollection) {
  const nodeIds = new Map<string, number>();
  const nodeOf = (p: Pt) => {
    const key = p.join();
    if (!nodeIds.has(key)) nodeIds.set(key, nodeIds.size);
    return nodeIds.get(key)!;
  };
  const edges: HalfEdge[] = [];
  const angleOf = (pts: Pt[]) => {
    const [x0, y0] = toM(pts[0]);
    const next = pts.find((p) => p[0] !== pts[0][0] || p[1] !== pts[0][1]) ?? pts[0];
    const [x1, y1] = toM(next);
    return Math.atan2(y1 - y0, x1 - x0);
  };
  for (const f of segments.features) {
    const c = f.geometry.coordinates;
    const a = nodeOf(c[0]);
    const b = nodeOf(c[c.length - 1]);
    const back = [...c].reverse();
    edges.push({ from: a, to: b, pts: c, angle: angleOf(c) }, { from: b, to: a, pts: back, angle: angleOf(back) });
  }
  const out: number[][] = Array.from({ length: nodeIds.size }, () => []);
  edges.forEach((e, i) => out[e.from].push(i));
  const pos: number[] = [];
  for (const list of out) {
    list.sort((p, q) => edges[p].angle - edges[q].angle);
    list.forEach((e, i) => (pos[e] = i));
  }
  /** Next edge around the face on the left of e: the first edge clockwise from e's twin at e's end. */
  const stepBack = (e: number, k = 1) => {
    const list = out[edges[e].to];
    return list[(pos[e ^ 1] - k + list.length * k) % list.length];
  };

  const face: number[] = edges.map(() => -1);
  const seen = edges.map(() => false);
  const faces: Face[] = [];
  edges.forEach((_, start) => {
    if (seen[start]) return;
    const ring: number[] = [];
    for (let e = start; !seen[e]; e = stepBack(e)) {
      seen[e] = true;
      ring.push(e);
    }
    let area2 = 0;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const e of ring) {
      const pts = edges[e].pts;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = toM(pts[i - 1]);
        const [x1, y1] = toM(pts[i]);
        area2 += x0 * y1 - x1 * y0;
      }
      for (const p of pts) {
        sx += p[0];
        sy += p[1];
        n++;
      }
    }
    if (area2 <= 0) return; // the outside of a connected piece of the network
    faces.push({ edges: ring, area: area2 / 2, cx: sx / n, cy: sy / n });
    for (const e of ring) face[e] = faces.length - 1;
  });
  return { edges, faces, face, out, pos, stepBack };
}

type Blocks = ReturnType<typeof buildBlocks>;

/** The loops around a group of blocks: counterclockwise outer loops (area > 0) and holes (area < 0). */
function boundaryLoops(blocks: Blocks, group: Set<number>): { edges: number[]; area: number }[] {
  const { edges, face, out, pos } = blocks;
  const onBorder = (e: number) => group.has(face[e]) && !group.has(face[e ^ 1]);
  const loops: { edges: number[]; area: number }[] = [];
  const seen = new Set<number>();
  for (const f of group) {
    for (const first of blocks.faces[f].edges) {
      if (!onBorder(first) || seen.has(first)) continue;
      const loop: number[] = [];
      let e = first;
      while (!seen.has(e)) {
        seen.add(e);
        loop.push(e);
        const list = out[edges[e].to];
        let k = 1;
        let next = list[(pos[e ^ 1] - k + list.length) % list.length];
        while (!onBorder(next)) next = list[(pos[e ^ 1] - ++k + list.length * k) % list.length];
        e = next;
      }
      let area2 = 0;
      for (const he of loop) {
        const pts = edges[he].pts;
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = toM(pts[i - 1]);
          const [x1, y1] = toM(pts[i]);
          area2 += x0 * y1 - x1 * y0;
        }
      }
      loops.push({ edges: loop, area: area2 / 2 });
    }
  }
  return loops;
}

/** Adds blocks enclosed by the group until it has no holes. Null if that would take a block of another zone, or if the group is not one piece. */
function withoutHoles(blocks: Blocks, group: Set<number>, taken: Map<number, number>): Set<number> | null {
  const closed = new Set(group);
  for (let round = 0; round < 25; round++) {
    const loops = boundaryLoops(blocks, closed);
    const holes = loops.filter((l) => l.area < 0);
    if (holes.length === 0) return loops.length === 1 ? closed : null;
    for (const hole of holes) {
      for (const e of hole.edges) {
        const inner = blocks.face[e ^ 1];
        if (inner < 0 || taken.has(inner)) return null;
        closed.add(inner);
      }
    }
  }
  return null;
}

function neighbours(blocks: Blocks, group: Set<number>): Set<number> {
  const found = new Set<number>();
  for (const f of group) {
    for (const e of blocks.faces[f].edges) {
      const g = blocks.face[e ^ 1];
      if (g >= 0 && !group.has(g)) found.add(g);
    }
  }
  return found;
}

export type PermitZoneFeatureCollection = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: { permit_code: string; name: string; city_id: string };
    geometry: { type: 'Polygon'; coordinates: number[][][] };
  }[];
};

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Eight non-overlapping zones DEMO-A to DEMO-H. Each is a group of touching city blocks grown from a seed block in a
 * residential zoning cell (a few blocks may reach outside it); DEMO-B is grown against DEMO-A so the two share an edge.
 */
export function generatePermitZones(segments: SegmentCollection, zoning: ZoningCollection, cityId: string, seed = SAMPLE_SEED): PermitZoneFeatureCollection {
  const blocks = buildBlocks(segments);
  const rng = mulberry32((seed ^ 0x5a4f4e45) >>> 0);
  const residentialCells = zoning.features.filter((z) => z.properties.category === 'residential').map((z) => z.geometry.coordinates[0]);
  if (residentialCells.length === 0) throw new Error('The zoning has no residential cell to put permit zones in');
  const isResidential = (f: number) => residentialCells.some((ring) => inRing(blocks.faces[f].cx, blocks.faces[f].cy, ring));
  const centreOf = (ring: number[][]): Pt => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const metresBetween = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * M_PER_DEG_X, (a[1] - b[1]) * M_PER_DEG_Y);

  const taken = new Map<number, number>(); // block -> zone index
  const groups: Set<number>[] = [];
  const seedAt: Pt[] = [];
  const usable = (f: number) => !taken.has(f) && blocks.faces[f].area <= MAX_BLOCK_M2;

  ZONE_LETTERS.forEach((_, zone) => {
    // Zone 1 (DEMO-B) starts against zone 0; the others start in the residential cells in turn.
    const cell = zone === 0 ? 0 : zone - 1;
    const target = centreOf(residentialCells[cell % residentialCells.length]);
    const fromFaces =
      zone === 1
        ? [...neighbours(blocks, groups[0])]
        : blocks.faces.map((_, f) => f);
    const seeds = fromFaces
      .filter((f) => usable(f) && blocks.faces[f].area >= MIN_SEED_M2 && isResidential(f))
      .filter((f) => zone === 1 || seedAt.every((c) => metresBetween(c, [blocks.faces[f].cx, blocks.faces[f].cy]) >= MIN_SEPARATION_M))
      .sort((a, b) => metresBetween([blocks.faces[a].cx, blocks.faces[a].cy], target) - metresBetween([blocks.faces[b].cx, blocks.faces[b].cy], target));
    const want = MIN_BLOCKS + Math.floor(rng() * (EXTRA_BLOCKS + 1));

    for (const first of seeds) {
      let group: Set<number> | null = new Set([first]);
      const centre: Pt = [blocks.faces[first].cx, blocks.faces[first].cy];
      let outside = isResidential(first) ? 0 : 1;
      while (group.size < want) {
        const options = [...neighbours(blocks, group)]
          .filter(usable)
          .sort((a, b) => {
            const ra = isResidential(a) ? 0 : 1;
            const rb = isResidential(b) ? 0 : 1;
            return ra - rb || metresBetween([blocks.faces[a].cx, blocks.faces[a].cy], centre) - metresBetween([blocks.faces[b].cx, blocks.faces[b].cy], centre);
          });
        let grown: Set<number> | null = null;
        for (const option of options) {
          const next = withoutHoles(blocks, new Set([...group, option]), taken);
          if (!next || next.size > want * 2) continue;
          const notResidential = [...next].filter((f) => !isResidential(f)).length;
          if (notResidential > Math.max(outside, next.size * OTHER_ZONING_SHARE)) continue;
          grown = next;
          outside = notResidential;
          break;
        }
        if (!grown) break;
        group = grown;
      }
      if (group.size >= MIN_BLOCKS - 2 && boundaryLoops(blocks, group).length === 1) {
        for (const f of group) taken.set(f, zone);
        groups.push(group);
        seedAt.push(centre);
        return;
      }
    }
    throw new Error(`Could not grow permit zone DEMO-${ZONE_LETTERS[zone]}`);
  });

  const features = groups.map((group, zone): PermitZoneFeatureCollection['features'][number] => {
    const loop = boundaryLoops(blocks, group)[0].edges;
    const ring: number[][] = [];
    for (const e of loop) {
      for (const p of blocks.edges[e].pts.slice(ring.length === 0 ? 0 : 1)) ring.push([p[0], p[1]]);
    }
    return {
      type: 'Feature',
      properties: { permit_code: `DEMO-${ZONE_LETTERS[zone]}`, name: `Demo permit zone ${ZONE_LETTERS[zone]}`, city_id: cityId },
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
  });
  return { type: 'FeatureCollection', features };
}

/** One feature per line, like the hand-made file, so diffs stay readable. */
export function permitZonesToJson(z: PermitZoneFeatureCollection): string {
  return `{"type":"FeatureCollection","features":[\n${z.features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}
