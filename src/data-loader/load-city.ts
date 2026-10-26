// The single entry point for city data (task M3-1, architecture rule 3). This is the only code
// in the app that fetches anything. Phase 2 replaces the body with an API call.
import type { FeatureCollection, LineString, Polygon } from 'geojson';
import { currentRoute, dataBaseUrl } from './route';

export type Side = 'L' | 'R';

/** Schedule format from schemas/schedule.schema.json. null means always in force. */
export interface ScheduleWindow {
  days: ('sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')[];
  start: string;
  end: string;
  weeks_of_month?: number[];
}
export type Schedule = { windows: ScheduleWindow[] } | null;

export interface CityConfig {
  city_id: string;
  name: string;
  time_zone: string;
}

/** Written by build:data to public/data/<folder>/metadata.json (task M5-2). */
export interface CityMetadata {
  city_id: string;
  /** YYYY-MM-DD in the city's time zone. */
  last_updated: string;
}

export interface CurbColorsConfig {
  city_id: string;
  colors: Record<string, { label: string; hex: string; time_limit_minutes: number | null; default_schedule: Schedule }>;
}

export interface ZoningCategoriesConfig {
  city_id: string;
  categories: Record<string, { label: string; hex: string }>;
  zone_codes: Record<string, string>;
}

export type SegmentCollection = FeatureCollection<LineString, { segment_id: string; street: string } & Record<string, unknown>>;

/** One drawn curb side. Rule properties (schedule, limit, type...) vary by layer. */
export type SideCollection = FeatureCollection<LineString, { segment_id: string; city_id: string; side: Side; offset: 'left' | 'right' } & Record<string, unknown>>;

export type PolygonCollection = FeatureCollection<Polygon, Record<string, unknown>>;

export interface Coverage {
  city_id: string;
  segment_ids: string[];
}

/** Band geometry flags per segment, from data/<city_id>/trim.json (task M2-8). */
export interface SegmentTrim {
  trim_start_m: number;
  trim_end_m: number;
  /** Block under 20 m: drawn only if it has a rule row. */
  sliver: boolean;
  /** Another block lies close beside this side, so it is not drawn (it still lists in the click-through). */
  inner_L: boolean;
  inner_R: boolean;
}

export interface TrimData {
  city_id: string;
  segments: Record<string, SegmentTrim>;
}

/** Written by build:data to public/data/<folder>/blocks.json (task M5-5): segment_id to block number, null when not recorded. */
export interface BlockNumbers {
  city_id: string;
  blocks: Record<string, number | null>;
}

export interface CityData {
  cityId: string;
  city: CityConfig;
  segments: SegmentCollection;
  sweeping: SideCollection;
  timedParking: SideCollection;
  restrictions: SideCollection;
  curbColors: SideCollection;
  coverage: Coverage;
  trim: TrimData;
  metadata: CityMetadata;
  /** Absent when the city has no blocks.csv (task M5-5). */
  blocks: BlockNumbers | null;
  /** Absent when the city has no polygons or config of this kind yet. */
  zoning: PolygonCollection | null;
  permitZones: PolygonCollection | null;
  curbColorConfig: CurbColorsConfig | null;
  zoningCategories: ZoningCategoriesConfig | null;
}

export type Fetcher = (url: string) => Promise<Response>;

export interface LoadOptions {
  /** Base URL that holds the data folders. Defaults to data/ under the site root, found from the page's path. */
  baseUrl?: string;
  fetcher?: Fetcher;
}

async function getJson<T>(fetcher: Fetcher, url: string, optional: boolean): Promise<T | null> {
  const res = await fetcher(url);
  if (res.status === 404 && optional) return null;
  if (!res.ok) throw new Error(`Could not load ${url}: HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    // A static host may answer a missing file with its HTML 404 page.
    if (optional) return null;
    throw new Error(`Could not load ${url}: not valid JSON`);
  }
}

/** Load every file in one data folder, e.g. "burbank" or "burbank-sample" (task M5-7). */
export async function loadCity(folder: string, options: LoadOptions = {}): Promise<CityData> {
  const base = options.baseUrl ?? dataBaseUrl(currentRoute().siteRoot);
  const fetcher = options.fetcher ?? ((url: string) => fetch(url));
  const url = (file: string) => `${base}/${folder}/${file}`;
  const required = <T>(file: string) => getJson<T>(fetcher, url(file), false) as Promise<T>;
  const optional = <T>(file: string) => getJson<T>(fetcher, url(file), true);

  const [city, segments, sweeping, timedParking, restrictions, curbColors, coverage, trim, metadata, zoning, permitZones, curbColorConfig, zoningCategories, blocks] =
    await Promise.all([
      required<CityConfig>('city.json'),
      required<SegmentCollection>('segments.geojson'),
      required<SideCollection>('sweeping.geojson'),
      required<SideCollection>('timed-parking.geojson'),
      required<SideCollection>('restrictions.geojson'),
      required<SideCollection>('curb-colors.geojson'),
      required<Coverage>('coverage.json'),
      required<TrimData>('trim.json'),
      required<CityMetadata>('metadata.json'),
      optional<PolygonCollection>('zoning.geojson'),
      optional<PolygonCollection>('permit-zones.geojson'),
      optional<CurbColorsConfig>('curb-colors.json'),
      optional<ZoningCategoriesConfig>('zoning-categories.json'),
      optional<BlockNumbers>('blocks.json'),
    ]);

  return { cityId: folder, city, segments, sweeping, timedParking, restrictions, curbColors, coverage, trim, metadata, zoning, permitZones, curbColorConfig, zoningCategories, blocks };
}
