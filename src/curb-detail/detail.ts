// What the click-through list says about a segment (task M4-3). Pure: it reads the loader's rule rows, never
// what the layers drew, so inner-facing sides and skipped slivers list their rules like any other side.
import type { CityData, Side, SideCollection } from '../data-loader';
import { instantFor, isActive, localParts, nextChange } from '../schedule-engine';
import type { Schedule, Weekday } from '../schedule-engine';
import { gridSide } from './grid';
import type { GridSide } from './grid';
import { scheduleText, statusText } from './format';

export type DetailData = Pick<
  CityData,
  'segments' | 'sweeping' | 'timedParking' | 'restrictions' | 'curbColors' | 'coverage' | 'trim' | 'curbColorConfig'
>;

/** The chosen day and hour, from the shared state. */
export interface DetailTime {
  day: Weekday;
  hour: number;
}

export interface RuleView {
  /** The map layer the rule is drawn in. */
  layer: string;
  rule: string;
  /** Extra words such as a curb color's label and time limit. */
  note: string | null;
  /** "Zone C permit exempt" or "Zone C permit required"; null when the row has no permit code. */
  permit: string | null;
  /** Exact windows, from the row's own schedule or, for a curb color without one, the color's default. */
  scheduleText: string;
  scheduleSource: 'own' | 'default';
  active: boolean;
  /** "Active, next change Tue 10:30" and so on, counted from the chosen hour. */
  status: string;
}

export interface SideView {
  side: Side;
  grid: GridSide;
  /** The zone this side lies in (from build time), null for none, undefined when the side has no rule rows to say. */
  permitZone: string | null | undefined;
  /** False when the map never draws this side (inner-facing). Its rules are listed all the same. */
  drawn: boolean;
  rules: RuleView[];
}

export interface SegmentView {
  segmentId: string;
  street: string;
  fromStreet: string;
  toStreet: string;
  mapped: boolean;
  sides: SideView[];
}

const SIDES: Side[] = ['L', 'R'];

const LAYER = {
  sweeping: 'Street sweeping',
  timed: 'Timed parking',
  restrictions: 'Restrictions',
  noStopping: 'No stopping/standing',
  curb: 'Curb colors',
} as const;

const hasPermit = (code: unknown): code is string => typeof code === 'string' && code !== '';

interface RawRule {
  layer: string;
  rule: string;
  note?: string | null;
  permit?: string | null;
  schedule: Schedule;
  source?: 'own' | 'default';
}

function rawRules(data: DetailData, segmentId: string, side: Side): RawRule[] {
  const rowsOf = (c: SideCollection) =>
    c.features.filter((f) => f.properties.segment_id === segmentId && f.properties.side === side).map((f) => f.properties);
  const out: RawRule[] = [];

  for (const p of rowsOf(data.sweeping)) {
    out.push({ layer: LAYER.sweeping, rule: 'Street sweeping', schedule: (p.schedule ?? null) as Schedule });
  }
  for (const p of rowsOf(data.timedParking)) {
    out.push({
      layer: LAYER.timed,
      rule: typeof p.limit_minutes === 'number' ? `${p.limit_minutes} minute limit` : 'Timed parking',
      permit: hasPermit(p.permit_code) ? `Zone ${p.permit_code} permit exempt` : null,
      schedule: (p.schedule ?? null) as Schedule,
    });
  }
  const restrictions = rowsOf(data.restrictions);
  for (const p of restrictions.filter((r) => r.type === 'no_parking')) {
    const required = p.permit_mode === 'required' && hasPermit(p.permit_code);
    out.push({
      layer: LAYER.restrictions,
      rule: required ? 'No parking except by permit' : 'No parking',
      permit: hasPermit(p.permit_code) ? `Zone ${p.permit_code} permit ${required ? 'required' : 'exempt'}` : null,
      schedule: (p.schedule ?? null) as Schedule,
    });
  }
  // A permit code on these rows is ignored, as on the map: a permit does not lift a stopping or standing ban.
  for (const p of restrictions.filter((r) => r.type !== 'no_parking')) {
    const rule = p.type === 'no_stopping' ? 'No stopping' : p.type === 'no_standing' ? 'No standing' : String(p.type);
    out.push({ layer: LAYER.noStopping, rule, schedule: (p.schedule ?? null) as Schedule });
  }
  for (const p of rowsOf(data.curbColors)) {
    const key = String(p.color_key);
    const entry = data.curbColorConfig?.colors[key];
    const own = (p.schedule ?? null) as Schedule;
    const note = entry
      ? entry.time_limit_minutes === null
        ? entry.label
        : `${entry.label}, ${entry.time_limit_minutes} minute limit`
      : null;
    out.push({
      layer: LAYER.curb,
      rule: `${key} curb`,
      note,
      schedule: own ?? entry?.default_schedule ?? null,
      source: own === null ? 'default' : 'own',
    });
  }
  return out;
}

/** Every rule on both sides of a segment, active or not, with the state and next change at the chosen hour. */
export function describeSegment(data: DetailData, segmentId: string, at: DetailTime, timeZone: string): SegmentView {
  const segment = data.segments.features.find((f) => f.properties.segment_id === segmentId);
  if (!segment) throw new Error(`Unknown segment ${segmentId}`);
  const props = segment.properties as Record<string, unknown>;
  const instant = instantFor(at.day, at.hour, timeZone);
  const here = localParts(instant, timeZone);
  const trim = data.trim.segments[segmentId];

  const sides = SIDES.map((side): SideView => {
    const rules = rawRules(data, segmentId, side).map((r): RuleView => {
      const active = isActive(r.schedule, instant, timeZone);
      const change = nextChange(r.schedule, instant, timeZone);
      const parts = change ? localParts(change, timeZone) : null;
      const next = parts && { ...parts, daysLater: parts.dayNumber - here.dayNumber };
      return {
        layer: r.layer,
        rule: r.rule,
        note: r.note ?? null,
        permit: r.permit ?? null,
        scheduleText: scheduleText(r.schedule),
        scheduleSource: r.source ?? 'own',
        active,
        status: statusText(active, next),
      };
    });
    const zones = [data.sweeping, data.timedParking, data.restrictions, data.curbColors]
      .flatMap((c) => c.features)
      .filter((f) => f.properties.segment_id === segmentId && f.properties.side === side)
      .map((f) => (f.properties as Record<string, unknown>).permit_zone as string | null);
    return {
      side,
      grid: gridSide(segment.geometry.coordinates, side),
      permitZone: zones.length > 0 ? zones[0] : undefined,
      drawn: !(trim && trim[`inner_${side}`]),
      rules,
    };
  });

  return {
    segmentId,
    street: String(props.street ?? ''),
    fromStreet: String(props.from_street ?? ''),
    toStreet: String(props.to_street ?? ''),
    mapped: data.coverage.segment_ids.includes(segmentId),
    sides,
  };
}
