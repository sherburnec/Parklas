// Pure logic for the data validator (task M2-3). No file I/O here: the CLI reads the files.
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

export interface Problem {
  file: string;
  /** CSV row (header is row 1) or GeoJSON feature number (first is 1). null when the problem is the whole file. */
  row: number | null;
  reason: string;
}

const SCHEMA_BY_FILE: Record<string, string> = {
  'city.json': 'city-config',
  'segments.geojson': 'segments',
  'zoning.geojson': 'zoning',
  'permit-zones.geojson': 'permit-zones',
  'curb-colors.json': 'curb-colors-config',
  'zoning-categories.json': 'zoning-categories-config',
  'trim.json': 'trim',
};

const RULE_COLUMNS = ['segment_id', 'city_id', 'side', 'layer', 'type', 'limit_minutes', 'permit_code', 'color_key', 'schedule'];
const REQUIRED_COLUMNS = ['segment_id', 'side', 'layer'];

// RFC 4180: quoted cells may hold commas, doubled quotes and newlines (schedule cells are JSON text).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function describeValue(v: unknown): string {
  return JSON.stringify(v) ?? 'nothing';
}

function fieldName(path: string): string {
  return path.split('/').filter(Boolean).join('.');
}

// Ajv's messages are terse and an `if`/`oneOf` schema yields several per mistake. Turn them into
// one plain sentence each, keeping only the useful ones.
function explain(errors: ErrorObject[]): string[] {
  const oneOfPaths = errors.filter((e) => e.keyword === 'oneOf').map((e) => e.instancePath);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of errors) {
    if (e.keyword === 'if') continue;
    // One sentence per field: a wrong value often fails several rules at once (type, then-branch).
    const p0 = e.params as Record<string, unknown>;
    const key = `${e.instancePath}|${p0.missingProperty ?? p0.additionalProperty ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.keyword !== 'oneOf' && oneOfPaths.some((p) => e.instancePath === p || e.instancePath.startsWith(p + '/'))) continue;
    const params = e.params as Record<string, unknown>;
    const field = fieldName(e.instancePath);
    const at = field ? `"${field}"` : 'this record';
    switch (e.keyword) {
      case 'required':
        out.push(`${field ? `${at} is` : 'It is'} missing the required field "${params.missingProperty}"`);
        break;
      case 'additionalProperties':
        out.push(`${at} has an unexpected field "${params.additionalProperty}"`);
        break;
      case 'enum':
        out.push(`${at} must be one of ${(params.allowedValues as unknown[]).map((v) => (v === null ? 'empty' : String(v))).join(', ')}`);
        break;
      case 'const':
        out.push(`${at} must be ${describeValue(params.allowedValue)}`);
        break;
      case 'type':
        out.push(`${at} must be ${[params.type].flat().map((t) => (t === 'null' ? 'empty' : t)).join(' or ')}`);
        break;
      case 'pattern':
        out.push(`${at} has the wrong format (expected ${params.pattern})`);
        break;
      case 'minimum':
        out.push(`${at} must be at least ${params.limit}`);
        break;
      case 'maximum':
        out.push(`${at} must be at most ${params.limit}`);
        break;
      case 'minLength':
        out.push(`${at} must not be empty`);
        break;
      case 'minItems':
        out.push(`${at} needs at least ${params.limit} item${params.limit === 1 ? '' : 's'}`);
        break;
      case 'maxItems':
        out.push(`${at} has too many items (at most ${params.limit})`);
        break;
      case 'uniqueItems':
        out.push(`${at} lists the same item twice`);
        break;
      case 'minProperties':
        out.push(`${at} must not be empty`);
        break;
      case 'oneOf':
        out.push(`${at} must be a valid Polygon or MultiPolygon`);
        break;
      default:
        out.push(`${at} ${e.message ?? 'is invalid'}`);
    }
  }
  return [...new Set(out)];
}

export function validateCity(files: Record<string, string>, schemas: object[]): Problem[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const s of schemas) ajv.addSchema(s);
  const validator = (name: string): ValidateFunction => {
    const v = ajv.getSchema(`https://parklas.local/schemas/${name}.schema.json`);
    if (!v) throw new Error(`Schema ${name} was not supplied`);
    return v;
  };

  const problems: Problem[] = [];
  const add = (file: string, row: number | null, reason: string) => problems.push({ file, row, reason });
  const parsed: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (!('city.json' in files)) add('city.json', null, 'The city config file is missing');

  // JSON and GeoJSON files: parse, then schema.
  for (const [file, text] of Object.entries(files)) {
    if (file.endsWith('.csv')) continue;
    const schemaName = SCHEMA_BY_FILE[file];
    if (!schemaName) {
      add(file, null, 'Not a recognised data file name (check the spelling), so it was not checked');
      continue;
    }
    let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      data = JSON.parse(text);
    } catch (err) {
      add(file, null, `Not valid JSON: ${(err as Error).message}`);
      continue;
    }
    parsed[file] = data;
    const validate = validator(schemaName);
    if (validate(data)) continue;
    const byFeature = new Map<number | null, ErrorObject[]>();
    for (const e of validate.errors ?? []) {
      const m = /^\/features\/(\d+)(.*)$/.exec(e.instancePath);
      const key = m ? Number(m[1]) + 1 : null;
      const list = byFeature.get(key) ?? [];
      list.push(m ? { ...e, instancePath: m[2] } : e);
      byFeature.set(key, list);
    }
    for (const [row, errs] of byFeature) for (const reason of explain(errs)) add(file, row, reason);
  }

  const segmentIds = new Set<string>(
    (parsed['segments.geojson']?.features ?? []).map((f: any) => f?.properties?.segment_id).filter(Boolean), // eslint-disable-line @typescript-eslint/no-explicit-any
  );
  // A sample set (city_id ending -sample) may put rules on any segment but uses obviously fake codes.
  const sample = String(parsed['city.json']?.city_id ?? '').endsWith('-sample');
  const colorKeys = new Set<string>(Object.keys(parsed['curb-colors.json']?.colors ?? {}));
  const hasColors = 'curb-colors.json' in parsed;

  // trim.json is generated from segments.geojson, so it must list exactly the same blocks.
  if (parsed['trim.json']?.segments && parsed['segments.geojson']) {
    const trimmed = new Set(Object.keys(parsed['trim.json'].segments));
    const missing = [...segmentIds].filter((id) => !trimmed.has(id));
    const extra = [...trimmed].filter((id) => !segmentIds.has(id));
    const hint = 'trim.json is out of date; run build:data for the real city folder to regenerate it';
    if (missing.length) add('trim.json', null, `No entry for ${missing.length} segment${missing.length === 1 ? '' : 's'} (first: "${missing[0]}"); ${hint}`);
    if (extra.length) add('trim.json', null, `${extra.length} entr${extra.length === 1 ? 'y is' : 'ies are'} not in segments.geojson (first: "${extra[0]}"); ${hint}`);
  }

  // Zoning: every zone code maps to a category that exists, and records agree with the map.
  const cfg = parsed['zoning-categories.json'];
  if (cfg?.zone_codes && cfg?.categories) {
    for (const [code, cat] of Object.entries(cfg.zone_codes as Record<string, string>)) {
      if (!(cat in cfg.categories)) {
        add('zoning-categories.json', null, `Zone code "${code}" maps to category "${cat}", which is not defined under "categories"`);
      }
      if (sample && !code.startsWith('SAMPLE-')) {
        add('zoning-categories.json', null, `Zone code "${code}" must start with SAMPLE- in a sample data set`);
      }
    }
  }
  if (parsed['zoning.geojson']?.features) {
    (parsed['zoning.geojson'].features as any[]).forEach((f, i) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const code = f?.properties?.zone_code;
      if (sample && typeof code === 'string' && !code.startsWith('SAMPLE-')) {
        add('zoning.geojson', i + 1, `Zone code "${code}" must start with SAMPLE- in a sample data set`);
      }
      if (typeof code !== 'string' || !cfg?.zone_codes) return;
      const mapped = cfg.zone_codes[code];
      if (mapped === undefined) {
        add('zoning.geojson', i + 1, `Zone code "${code}" has no category in zoning-categories.json (add it under "zone_codes")`);
      } else if (f.properties.category !== mapped) {
        add('zoning.geojson', i + 1, `Zone code "${code}" is marked "${f.properties.category}" here but zoning-categories.json maps it to "${mapped}"`);
      }
    });
  }

  // Permit zones.
  if (sample && parsed['permit-zones.geojson']?.features) {
    (parsed['permit-zones.geojson'].features as any[]).forEach((f, i) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const code = f?.properties?.permit_code;
      if (typeof code === 'string' && !code.startsWith('DEMO-')) {
        add('permit-zones.geojson', i + 1, `Permit code "${code}" must start with DEMO- in a sample data set`);
      }
    });
  }

  // Rule CSVs.
  const validateRow = validator('rule-row');
  for (const [file, text] of Object.entries(files)) {
    if (!file.endsWith('.csv')) continue;
    const rows = parseCsv(text);
    if (rows.length === 0) {
      add(file, null, 'The file is empty (it needs a header row)');
      continue;
    }
    const header = rows[0].map((h) => h.trim());
    const unknown = header.filter((h) => !RULE_COLUMNS.includes(h));
    const missing = REQUIRED_COLUMNS.filter((h) => !header.includes(h));
    for (const h of unknown) add(file, 1, `Unknown column "${h}" (allowed: ${RULE_COLUMNS.join(', ')})`);
    for (const h of missing) add(file, 1, `The header is missing the required column "${h}"`);
    if (unknown.length || missing.length) continue;

    rows.slice(1).forEach((cells, i) => {
      const n = i + 2;
      if (cells.length === 1 && cells[0].trim() === '') return; // blank line
      if (cells.length !== header.length) {
        add(file, n, `Row has ${cells.length} cells but the header has ${header.length}`);
        return;
      }
      const rec: Record<string, unknown> = {};
      const cellProblems: string[] = [];
      header.forEach((h, c) => {
        const v = cells[c].trim();
        if (v === '') rec[h] = null;
        else if (h === 'limit_minutes') rec[h] = /^-?\d+$/.test(v) ? Number(v) : v;
        else if (h === 'schedule') {
          try {
            rec[h] = JSON.parse(v);
          } catch {
            cellProblems.push('"schedule" is not valid JSON (check quotes and brackets)');
          }
        } else rec[h] = v;
      });
      for (const p of cellProblems) add(file, n, p);
      if (cellProblems.length) return;

      if (!validateRow(rec)) for (const reason of explain(validateRow.errors ?? [])) add(file, n, reason);
      if (typeof rec.segment_id === 'string' && !segmentIds.has(rec.segment_id)) {
        add(file, n, `segment_id "${rec.segment_id}" is not in segments.geojson`);
      }
      if (sample && typeof rec.permit_code === 'string' && !rec.permit_code.startsWith('DEMO-')) {
        add(file, n, `permit_code "${rec.permit_code}" must start with DEMO- in a sample data set`);
      }
      if (typeof rec.color_key === 'string' && !colorKeys.has(rec.color_key)) {
        add(
          file,
          n,
          hasColors
            ? `color_key "${rec.color_key}" is not in curb-colors.json (add it there or fix the spelling)`
            : `color_key "${rec.color_key}" is used but this city has no curb-colors.json`,
        );
      }
    });
  }

  return problems;
}
