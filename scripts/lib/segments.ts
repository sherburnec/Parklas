// Pure logic for the one-time OSM street extraction (task M1-1). No I/O here.

export type OsmElement =
  | { type: 'node'; id: number; lat: number; lon: number }
  | { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> };

export interface SegmentProperties {
  segment_id: string;
  street: string;
  from_street: string | null;
  to_street: string | null;
  city_id: string;
}

export interface SegmentFeature {
  type: 'Feature';
  properties: SegmentProperties;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

export interface SegmentCollection {
  type: 'FeatureCollection';
  features: SegmentFeature[];
}

export interface SegmentDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

// Roads with curbs. Motorways, every *_link ramp, footpaths, service alleys and tracks are left out.
const CURB_HIGHWAYS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

export function isCurbRoad(tags: Record<string, string> | undefined): boolean {
  if (!tags?.highway || !tags.name) return false;
  if (tags.area === 'yes') return false;
  return CURB_HIGHWAYS.has(tags.highway);
}

interface Edge {
  a: number;
  b: number;
  name: string;
}

const round = (n: number) => Math.round(n * 1e7) / 1e7;

export function buildSegments(elements: OsmElement[], cityId: string): SegmentCollection {
  const coords = new Map<number, [number, number]>();
  for (const el of elements) {
    if (el.type === 'node') coords.set(el.id, [round(el.lon), round(el.lat)]);
  }

  // One edge per pair of consecutive nodes on a kept way.
  const edges: Edge[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !isCurbRoad(el.tags)) continue;
    const name = el.tags!.name;
    for (let i = 0; i < el.nodes.length - 1; i++) {
      const a = el.nodes[i];
      const b = el.nodes[i + 1];
      if (a === b || !coords.has(a) || !coords.has(b)) continue;
      edges.push({ a, b, name });
    }
  }

  const incident = new Map<number, number[]>();
  const attach = (n: number, e: number) => {
    const list = incident.get(n);
    if (list) list.push(e);
    else incident.set(n, [e]);
  };
  edges.forEach((e, i) => {
    attach(e.a, i);
    attach(e.b, i);
  });

  // A node ends a block unless exactly two edges of the same street pass through it.
  const isBreak = (n: number): boolean => {
    const list = incident.get(n)!;
    if (list.length !== 2) return true;
    return edges[list[0]].name !== edges[list[1]].name;
  };

  const namesAt = (n: number) => new Set(incident.get(n)!.map((i) => edges[i].name));
  const crossStreet = (n: number, own: string): string | null => {
    const others = [...namesAt(n)].filter((s) => s !== own).sort();
    return others.length ? others.join(' / ') : null;
  };

  const visited = new Set<number>();
  const chains: { nodes: number[]; name: string }[] = [];

  const walk = (start: number, first: number, stopAt: (n: number) => boolean) => {
    const nodes = [start];
    let edgeIdx = first;
    let at = start;
    for (;;) {
      visited.add(edgeIdx);
      const e = edges[edgeIdx];
      at = e.a === at ? e.b : e.a;
      nodes.push(at);
      if (stopAt(at)) break;
      const next = incident.get(at)!.find((i) => i !== edgeIdx && !visited.has(i));
      if (next === undefined) break;
      edgeIdx = next;
    }
    chains.push({ nodes, name: edges[first].name });
  };

  const sortedNodes = [...incident.keys()].sort((x, y) => x - y);
  for (const n of sortedNodes) {
    if (!isBreak(n)) continue;
    for (const e of incident.get(n)!) {
      if (!visited.has(e)) walk(n, e, isBreak);
    }
  }
  // Whatever is left has no break node at all: a closed ring of one street.
  for (let i = 0; i < edges.length; i++) {
    if (visited.has(i)) continue;
    const start = edges[i].a;
    walk(start, i, (n) => n === start);
  }

  // Orient each chain by node id so the geometry does not depend on OSM way direction.
  const oriented = chains.map(({ nodes, name }) => {
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const flip = first === last ? nodes[1] > nodes[nodes.length - 2] : first > last;
    return { nodes: flip ? [...nodes].reverse() : nodes, name };
  });

  // id = city-from-to; blocks sharing both ends are told apart by their second node.
  const base = (nodes: number[]) => `${cityId}-${nodes[0]}-${nodes[nodes.length - 1]}`;
  const groupSize = new Map<string, number>();
  for (const c of oriented) groupSize.set(base(c.nodes), (groupSize.get(base(c.nodes)) ?? 0) + 1);

  const used = new Set<string>();
  const features: SegmentFeature[] = oriented.map(({ nodes, name }) => {
    let id = base(nodes);
    if (groupSize.get(id)! > 1) id = `${id}-${nodes[1]}`;
    for (let n = 2; used.has(id); n++) id = `${base(nodes)}-${nodes[1]}-${n}`;
    used.add(id);
    return {
      type: 'Feature',
      properties: {
        segment_id: id,
        street: name,
        from_street: crossStreet(nodes[0], name),
        to_street: crossStreet(nodes[nodes.length - 1], name),
        city_id: cityId,
      },
      geometry: { type: 'LineString', coordinates: nodes.map((n) => coords.get(n)!) },
    };
  });

  features.sort((x, y) => (x.properties.segment_id < y.properties.segment_id ? -1 : 1));
  return { type: 'FeatureCollection', features };
}

// Independent check on the output alone: a vertex inside one block must not be a vertex of any
// other block. Returns the ids of blocks that fail.
export function findBlocksCrossingIntersections(fc: SegmentCollection): string[] {
  const owners = new Map<string, Set<string>>();
  for (const f of fc.features) {
    for (const [lon, lat] of f.geometry.coordinates) {
      const key = `${lon},${lat}`;
      const set = owners.get(key);
      if (set) set.add(f.properties.segment_id);
      else owners.set(key, new Set([f.properties.segment_id]));
    }
  }
  const bad: string[] = [];
  for (const f of fc.features) {
    const interior = f.geometry.coordinates.slice(1, -1);
    if (interior.some(([lon, lat]) => owners.get(`${lon},${lat}`)!.size > 1)) bad.push(f.properties.segment_id);
  }
  return bad.sort();
}

const signature = (f: SegmentFeature) => JSON.stringify([f.properties, f.geometry.coordinates]);

export function diffSegments(before: SegmentCollection, after: SegmentCollection): SegmentDiff {
  const old = new Map(before.features.map((f) => [f.properties.segment_id, signature(f)]));
  const next = new Map(after.features.map((f) => [f.properties.segment_id, signature(f)]));
  return {
    added: [...next.keys()].filter((id) => !old.has(id)).sort(),
    removed: [...old.keys()].filter((id) => !next.has(id)).sort(),
    changed: [...next.keys()].filter((id) => old.has(id) && old.get(id) !== next.get(id)).sort(),
  };
}
