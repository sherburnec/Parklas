// M1-3 throwaway spike: three offset bands per curb side over ten Burbank blocks.
// Standalone page (not part of the app build, does not use the basemap module).
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import segmentsRaw from '../data/burbank/segments.geojson?raw';

maplibregl.setWorkerUrl(workerUrl);

type Pt = [number, number];
const ALL = JSON.parse(segmentsRaw) as FeatureCollection<LineString>;

// Downtown Burbank, San Fernando Blvd / Glenoaks Blvd. Lengths in m. Three Glenoaks blocks share
// one node (corner test); the last is a 16 m sliver (worst case); the first two are the shortest real blocks.
const SPIKE_IDS = [
  'burbank-27305224-1907900640', // 44
  'burbank-16747029-9435847598', // 45
  'burbank-35528322-3932266533', // 58
  'burbank-3932266532-3932266533', // 58
  'burbank-20930414-3932266533', // 58
  'burbank-9435766266-9435847598', // 75
  'burbank-35519561-9435847598', // 75
  'burbank-9435766265-9435766266', // 114
  'burbank-20930414-1903418597', // 160
  'burbank-20930414-3932266532', // 16
];

const BANDS = [
  { id: 'a', color: '#d95f02' },
  { id: 'b', color: '#1b9e77' },
  { id: 'c', color: '#7570b3' },
];

const R = 6371008.8;
const RAD = Math.PI / 180;
const toM = (p: Pt, o: Pt): Pt => [(p[0] - o[0]) * RAD * R * Math.cos(o[1] * RAD), (p[1] - o[1]) * RAD * R];

function dist(a: Pt, b: Pt): number {
  const [x, y] = toM(a, b);
  return Math.hypot(x, y);
}

function length(c: Pt[]): number {
  let s = 0;
  for (let i = 1; i < c.length; i++) s += dist(c[i], c[i - 1]);
  return s;
}

/** Cut `from` m off the start and `to` m off the end of a polyline. */
function trim(c: Pt[], from: number, to: number): Pt[] {
  const hi = length(c) - to;
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const d = dist(c[i + 1], c[i]);
    const a = acc;
    const at = (t: number): Pt => [c[i][0] + (c[i + 1][0] - c[i][0]) * t, c[i][1] + (c[i + 1][1] - c[i][1]) * t];
    if (a + d > from && a < hi) {
      if (out.length === 0) out.push(at(Math.max(0, (from - a) / d)));
      out.push(at(Math.min(1, (hi - a) / d)));
    }
    acc += d;
  }
  return out;
}

/**
 * Which N/S/E/W pair does a block carry? East-west-ish streets have N and S curbs, the rest E and W.
 * Burbank's downtown grid is rotated ~45 degrees, so ties go to N/S (see spike notes).
 */
function sidesFor(c: Pt[]): { label: string; normal: Pt }[] {
  const [dx, dy] = toM(c[c.length - 1], c[0]);
  return Math.abs(dx) >= Math.abs(dy)
    ? [{ label: 'N', normal: [0, 1] }, { label: 'S', normal: [0, -1] }]
    : [{ label: 'E', normal: [1, 0] }, { label: 'W', normal: [-1, 0] }];
}

/** +1 = right of travel, -1 = left. MapLibre line-offset: positive shifts right of the line's direction. */
function offsetSign(c: Pt[], normal: Pt): 1 | -1 {
  const [dx, dy] = toM(c[c.length - 1], c[0]);
  return dy * normal[0] - dx * normal[1] > 0 ? 1 : -1;
}

interface Params { first: number; step: number; width: number; minw: number; trim: number }
const params: Params = { first: 2, step: 2, width: 1, minw: 2, trim: 0 };

// Unit vectors pointing away from each shared endpoint, one per block that ends there.
const key = (p: Pt) => `${p[0]},${p[1]}`;
const outward = new Map<string, Pt[]>();
function awayFrom(c: Pt[], atStart: boolean): Pt {
  const pts = atStart ? c : [...c].reverse();
  // Aim at a point ~10 m along the block, not the first vertex, so a tiny first edge does not skew the angle.
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i], pts[i - 1]);
    if (acc >= 10 || i === pts.length - 1) {
      const [x, y] = toM(pts[i], pts[0]);
      const h = Math.hypot(x, y) || 1;
      return [x / h, y / h];
    }
  }
  return [0, 0];
}
for (const f of ALL.features) {
  const c = f.geometry.coordinates as Pt[];
  for (const [p, atStart] of [[c[0], true], [c[c.length - 1], false]] as [Pt, boolean][]) {
    const list = outward.get(key(p)) ?? [];
    list.push(awayFrom(c, atStart));
    outward.set(key(p), list);
  }
}

const M_PER_PX_Z17 = 0.494; // 78271.5 * cos(34.18 deg) / 2^17 on MapLibre's 512 px tiles

/**
 * Metres to cut off one end. The outer band sits `reach` m from the centreline; where two blocks meet at
 * angle theta, the bands of the two blocks first cross `reach / tan(theta / 2)` m from the node.
 * A right-angle corner needs ~reach; a sharp fork needs several times that, so the cut is capped at 35%
 * of the block (the shortest blocks then keep a stub of band, and sharp forks may still touch).
 */
function endTrim(c: Pt[], idx: number): number {
  const atStart = idx === 0;
  const mine = awayFrom(c, atStart);
  const others = outward.get(key(c[idx])) ?? [];
  const reach = (params.first + 2 * params.step + Math.max(params.width, params.minw) / 2) * M_PER_PX_Z17;
  let theta = Math.PI; // dead end: nothing to collide with
  for (const o of others) {
    const dot = mine[0] * o[0] + mine[1] * o[1];
    if (dot > 0.9999) continue; // that is this block itself
    theta = Math.min(theta, Math.acos(Math.max(-1, Math.min(1, dot))));
  }
  const needed = theta >= Math.PI ? 0 : reach / Math.tan(theta / 2);
  return Math.min(Math.max(params.trim, needed), length(c) * 0.35);
}

function bandFeatures(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (const f of ALL.features) {
    const id = f.properties?.segment_id as string;
    if (!SPIKE_IDS.includes(id)) continue;
    const c = f.geometry.coordinates as Pt[];
    const cut = trim(c, endTrim(c, 0), endTrim(c, c.length - 1));
    for (const s of sidesFor(c)) {
      features.push({
        type: 'Feature',
        properties: { segment_id: id, side: s.label, sgn: offsetSign(c, s.normal) },
        geometry: { type: 'LineString', coordinates: cut },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

// Pixel sizes are specified at z17 and scale 2x per zoom level between z15 and z19, so bands track the street.
const zoomScaled = (px: number): maplibregl.ExpressionSpecification => [
  'interpolate', ['exponential', 2], ['zoom'], 15, px / 4, 17, px, 19, px * 4,
];

function bandPaint(bandIdx: number, sgn: 1 | -1) {
  const off = (params.first + params.step * bandIdx) * sgn;
  return {
    offset: zoomScaled(off),
    // MapLibre forbids wrapping a zoom curve in max(), so the minimum width is clamped into each stop.
    width: [
      'interpolate', ['exponential', 2], ['zoom'],
      15, Math.max(params.minw, params.width / 4),
      17, Math.max(params.minw, params.width),
      19, Math.max(params.minw, params.width * 4),
    ] as maplibregl.ExpressionSpecification,
  };
}

const style: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    all: { type: 'geojson', data: ALL },
    bands: { type: 'geojson', data: bandFeatures() },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#f4f4f2' } },
    {
      id: 'streets',
      type: 'line',
      source: 'all',
      paint: { 'line-color': '#bbb', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 17, 3] },
    },
    ...BANDS.flatMap((b, i) =>
      ([1, -1] as const).map((sgn) => {
        const p = bandPaint(i, sgn);
        return {
          id: `band-${b.id}-${sgn}`,
          type: 'line' as const,
          source: 'bands',
          filter: ['==', ['get', 'sgn'], sgn] as maplibregl.FilterSpecification,
          layout: { 'line-cap': 'butt' as const, 'line-join': 'round' as const },
          paint: { 'line-color': b.color, 'line-offset': p.offset, 'line-width': p.width },
        };
      }),
    ),
  ],
};

// Centre on the three Glenoaks blocks that meet at one node.
const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [-118.3017, 34.1799],
  zoom: 17,
  attributionControl: { customAttribution: '© OpenStreetMap contributors' },
});

function refresh() {
  (map.getSource('bands') as maplibregl.GeoJSONSource).setData(bandFeatures());
  BANDS.forEach((b, i) =>
    ([1, -1] as const).forEach((sgn) => {
      const p = bandPaint(i, sgn);
      map.setPaintProperty(`band-${b.id}-${sgn}`, 'line-offset', p.offset);
      map.setPaintProperty(`band-${b.id}-${sgn}`, 'line-width', p.width);
    }),
  );
}

for (const key of Object.keys(params) as (keyof Params)[]) {
  const input = document.getElementById(key) as HTMLInputElement;
  input.value = String(params[key]);
  const out = input.nextElementSibling as HTMLElement;
  out.textContent = input.value;
  input.addEventListener('input', () => {
    params[key] = Number(input.value);
    out.textContent = input.value;
    refresh();
  });
}

const zoomEl = document.getElementById('zoom') as HTMLElement;
const showZoom = () => (zoomEl.textContent = `zoom ${map.getZoom().toFixed(2)}`);
map.on('zoom', showZoom);
map.on('load', showZoom);
(window as unknown as { map: maplibregl.Map }).map = map;
