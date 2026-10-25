import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTrim, type BandConfig } from './trim.ts';
import { parseCsv, validateCity } from './validate.ts';

const schemaDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');
const schemas = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(schemaDir, f), 'utf8')) as object);

const config = JSON.parse(readFileSync(resolve(schemaDir, '..', 'config', 'band-geometry.json'), 'utf8')) as BandConfig;

const HEADER = 'segment_id,side,layer,type,limit_minutes,permit_code,color_key,schedule';
const SCHEDULE = '"{""windows"":[{""days"":[""mon""],""start"":""08:00"",""end"":""10:00""}]}"';

const square = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];

/** A permit zones file holding one zone, A, so a rule row may name it. */
function zoneAFile(): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { permit_code: 'A', name: 'Zone A', city_id: 'testville' }, geometry: { type: 'Polygon', coordinates: square } }],
  });
}

function goodCity(): Record<string, string> {
  return {
    'city.json': JSON.stringify({ city_id: 'testville', name: 'Testville', time_zone: 'America/Los_Angeles' }),
    'segments.geojson': JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { segment_id: 'seg-1', street: 'Main St', from_street: null, to_street: null, city_id: 'testville' },
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        },
      ],
    }),
    'curb-colors.json': JSON.stringify({
      city_id: 'testville',
      colors: { red: { label: 'Red', hex: '#FF0000', time_limit_minutes: null, default_schedule: null } },
    }),
    'zoning-categories.json': JSON.stringify({
      city_id: 'testville',
      categories: { residential: { label: 'Residential', hex: '#FFEEAA' } },
      zone_codes: { R1: 'residential' },
    }),
    'zoning.geojson': JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { zone_code: 'R1', category: 'residential', name: 'Single family', city_id: 'testville' },
          geometry: { type: 'Polygon', coordinates: square },
        },
      ],
    }),
    'rules.csv': [
      HEADER,
      `seg-1,L,sweeping,,,,,${SCHEDULE}`,
      'seg-1,R,timed_parking,,2,,,',
      'seg-1,L,curb_color,,,,red,',
    ].join('\n'),
  };
}

describe('parseCsv', () => {
  it('splits rows and handles quoted commas, quotes and newlines', () => {
    expect(parseCsv('a,b\n"x,1","he said ""hi"""\r\n"l1\nl2",z\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'he said "hi"'],
      ['l1\nl2', 'z'],
    ]);
  });

  it('keeps empty cells and ignores a trailing blank line', () => {
    expect(parseCsv('a,b,c\n1,,3\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });
});

describe('validateCity', () => {
  it('accepts a good city', () => {
    expect(validateCity(goodCity(), schemas)).toEqual([]);
  });

  it('reports a bad CSV row with its row number (header is row 1)', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,X,sweeping,,,,,';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 5 });
    expect(problems[0].reason).toContain('side');
    expect(problems[0].reason).toContain('L, R');
  });

  it('rejects the old compass sides N, S, E and W, and lower-case l and r', () => {
    for (const side of ['N', 'S', 'E', 'W', 'l', 'r']) {
      const files = goodCity();
      files['rules.csv'] += `\nseg-1,${side},sweeping,,,,,`;
      const problems = validateCity(files, schemas);
      expect(problems, side).toHaveLength(1);
      expect(problems[0], side).toMatchObject({ file: 'rules.csv', row: 5 });
      expect(problems[0].reason, side).toContain('must be one of L, R');
    }
  });

  it('reports a segment_id that is not in segments.geojson', () => {
    const files = goodCity();
    files['rules.csv'] += '\nnope-1,L,sweeping,,,,,';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 5 });
    expect(problems[0].reason).toContain('nope-1');
  });

  it('accepts permit_mode "required" or "exempt" on a no_parking restriction with a permit code', () => {
    for (const mode of ['required', 'exempt']) {
      const files = goodCity();
      files['permit-zones.geojson'] = zoneAFile();
      files['rules.csv'] = [
        'segment_id,side,layer,type,limit_minutes,permit_code,permit_mode,color_key,schedule',
        `seg-1,L,restrictions,no_parking,,A,${mode},,`,
      ].join('\n');
      expect(validateCity(files, schemas).filter((p) => p.severity === 'error'), mode).toEqual([]);
    }
  });

  it('rejects permit_mode without a permit code, on other layers and types, and unknown values', () => {
    const header = 'segment_id,side,layer,type,limit_minutes,permit_code,permit_mode,color_key,schedule';
    const bad = [
      'seg-1,L,restrictions,no_parking,,,required,,',
      'seg-1,L,restrictions,no_stopping,,A,required,,',
      'seg-1,L,restrictions,no_parking,,A,maybe,,',
      'seg-1,L,timed_parking,,60,A,required,,',
      'seg-1,L,sweeping,,,,required,,',
    ];
    for (const line of bad) {
      const files = goodCity();
      files['rules.csv'] = [header, line].join('\n');
      const problems = validateCity(files, schemas);
      expect(problems.length, line).toBeGreaterThan(0);
      expect(problems[0], line).toMatchObject({ file: 'rules.csv', row: 2 });
    }
  });

  it('reports a color_key that is not in the curb color config', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,R,curb_color,,,,purple,';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 5 });
    expect(problems[0].reason).toContain('purple');
  });

  it('reports color_key rows when the city has no curb color config', () => {
    const files = goodCity();
    delete files['curb-colors.json'];
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 4 });
  });

  it('reports a schedule cell that is not valid JSON', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,L,sweeping,,,,,{not json';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 5 });
    expect(problems[0].reason).toContain('schedule');
  });

  it('reports a schedule that breaks the schedule schema', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,L,sweeping,,,,,"{""windows"":[{""days"":[""funday""],""start"":""8am"",""end"":""10:00""}]}"';
    const problems = validateCity(files, schemas);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.file === 'rules.csv' && p.row === 5)).toBe(true);
  });

  it('reports a non-integer limit_minutes and a wrong cell count', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,L,timed_parking,,two,,,\nseg-1,L,sweeping';
    const problems = validateCity(files, schemas);
    expect(problems.map((p) => p.row).sort()).toEqual([5, 6]);
    expect(problems.find((p) => p.row === 5)?.reason).toContain('limit_minutes');
    expect(problems.find((p) => p.row === 6)?.reason).toContain('cells');
  });

  it('reports missing or unknown CSV columns', () => {
    const files = goodCity();
    files['rules.csv'] = 'segment_id,side,bogus\nseg-1,L,x';
    const reasons = validateCity(files, schemas).map((p) => p.reason).join('\n');
    expect(reasons).toContain('layer');
    expect(reasons).toContain('bogus');
  });

  it('reports a zone code with no category mapping', () => {
    const files = goodCity();
    const zoning = JSON.parse(files['zoning.geojson']);
    zoning.features.push({
      ...zoning.features[0],
      properties: { ...zoning.features[0].properties, zone_code: 'ZZ9' },
    });
    files['zoning.geojson'] = JSON.stringify(zoning);
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'zoning.geojson', row: 2 });
    expect(problems[0].reason).toContain('ZZ9');
  });

  it('reports a zone code mapped to a category that is not defined', () => {
    const files = goodCity();
    const cfg = JSON.parse(files['zoning-categories.json']);
    cfg.zone_codes.C2 = 'commercial';
    files['zoning-categories.json'] = JSON.stringify(cfg);
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0].file).toBe('zoning-categories.json');
    expect(problems[0].reason).toContain('commercial');
  });

  it('reports a feature whose category differs from its zone code mapping', () => {
    const files = goodCity();
    const cfg = JSON.parse(files['zoning-categories.json']);
    cfg.categories.commercial = { label: 'Commercial', hex: '#AABBCC' };
    files['zoning-categories.json'] = JSON.stringify(cfg);
    const zoning = JSON.parse(files['zoning.geojson']);
    zoning.features[0].properties.category = 'commercial';
    files['zoning.geojson'] = JSON.stringify(zoning);
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'zoning.geojson', row: 1 });
  });

  it('reports a bad GeoJSON feature by feature number, in plain words', () => {
    const files = goodCity();
    const seg = JSON.parse(files['segments.geojson']);
    delete seg.features[0].properties.street;
    files['segments.geojson'] = JSON.stringify(seg);
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'segments.geojson', row: 1 });
    expect(problems[0].reason).toContain('street');
  });

  it('reports a bad polygon geometry once, not once per schema branch', () => {
    const files = goodCity();
    const zoning = JSON.parse(files['zoning.geojson']);
    zoning.features[0].geometry = { type: 'Point', coordinates: [0, 0] };
    files['zoning.geojson'] = JSON.stringify(zoning);
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toContain('geometry');
  });

  it('reports a file that is not valid JSON', () => {
    const files = goodCity();
    files['city.json'] = '{ nope';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'city.json', row: null });
  });

  it('reports a missing city.json and an unrecognised file', () => {
    const files = goodCity();
    delete files['city.json'];
    files['notes.txt'] = 'hello';
    const problems = validateCity(files, schemas);
    expect(problems.map((p) => p.file).sort()).toEqual(['city.json', 'notes.txt']);
  });
});

describe('trim.json', () => {
  const entry = { trim_start_m: 3.4, trim_end_m: 0, sliver: false, inner_L: false, inner_R: true };
  const withTrim = (trim: unknown) => ({ ...goodCity(), 'trim.json': JSON.stringify(trim) });

  it('is optional, and accepted when it matches the segments', () => {
    expect(validateCity(withTrim({ city_id: 'testville', segments: { 'seg-1': entry } }), schemas)).toEqual([]);
  });

  it('accepts what buildTrim writes, for any city_id', () => {
    const files = goodCity();
    const trim = buildTrim(JSON.parse(files['segments.geojson']), config);
    expect(validateCity({ ...files, 'trim.json': JSON.stringify(trim) }, schemas)).toEqual([]);
  });

  it('reports a bad entry in plain words', () => {
    const problems = validateCity(withTrim({ city_id: 'testville', segments: { 'seg-1': { ...entry, sliver: 'yes', trim_end_m: -1, extra: 1 } } }), schemas);
    expect(problems.every((p) => p.file === 'trim.json')).toBe(true);
    expect(problems.map((p) => p.reason).join('\n')).toMatch(/sliver.*boolean/);
    expect(problems.map((p) => p.reason).join('\n')).toMatch(/trim_end_m.*at least 0/);
    expect(problems.map((p) => p.reason).join('\n')).toMatch(/unexpected field "extra"/);
  });

  it('reports a trim file that is out of step with the segments, both ways', () => {
    const stale = validateCity(withTrim({ city_id: 'testville', segments: { 'old-seg': entry } }), schemas);
    expect(stale.map((p) => p.reason).join('\n')).toMatch(/No entry for 1 segment \(first: "seg-1"\).*build:data/);
    expect(stale.map((p) => p.reason).join('\n')).toMatch(/not in segments\.geojson \(first: "old-seg"\)/);
  });
});

describe('sample data set', () => {
  function sampleCity(): Record<string, string> {
    return {
      'city.json': JSON.stringify({ city_id: 'testville-sample', name: 'Testville (sample)', time_zone: 'America/Los_Angeles' }),
      'segments.geojson': goodCity()['segments.geojson'],
      'rules.csv': HEADER,
      'zoning.geojson': JSON.stringify({ type: 'FeatureCollection', features: [] }),
      'permit-zones.geojson': JSON.stringify({ type: 'FeatureCollection', features: [] }),
      'curb-colors.json': JSON.stringify({ city_id: 'testville-sample', colors: {} }),
      'zoning-categories.json': JSON.stringify({ city_id: 'testville-sample', categories: {}, zone_codes: {} }),
    };
  }

  const zone = (code: string) => ({
    type: 'Feature',
    properties: { zone_code: code, category: 'residential', name: 'Fake', city_id: 'testville-sample' },
    geometry: { type: 'Polygon', coordinates: square },
  });

  it('accepts an empty sample set', () => {
    expect(validateCity(sampleCity(), schemas)).toEqual([]);
  });

  it('accepts rows on any segment, with no area list', () => {
    const files = sampleCity();
    const seg = JSON.parse(files['segments.geojson']);
    seg.features.push({ ...seg.features[0], properties: { ...seg.features[0].properties, segment_id: 'seg-2' } });
    files['segments.geojson'] = JSON.stringify(seg);
    files['rules.csv'] += '\nseg-1,L,sweeping,,,,,\nseg-2,L,sweeping,,,,,';
    expect(validateCity(files, schemas)).toEqual([]);
  });

  it('still rejects a row whose segment is not in the segments file', () => {
    const files = sampleCity();
    files['rules.csv'] += '\nghost,L,sweeping,,,,,';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 2 });
  });

  it('flags a leftover area.json as an unrecognised file', () => {
    const files = sampleCity();
    files['area.json'] = '{}';
    expect(validateCity(files, schemas).map((p) => p.file)).toEqual(['area.json']);
  });

  it('requires zone codes to start with SAMPLE-', () => {
    const files = sampleCity();
    files['zoning-categories.json'] = JSON.stringify({
      city_id: 'testville-sample',
      categories: { residential: { label: 'Residential', hex: '#FFEEAA' } },
      zone_codes: { 'SAMPLE-R1': 'residential', R2: 'residential' },
    });
    files['zoning.geojson'] = JSON.stringify({ type: 'FeatureCollection', features: [zone('SAMPLE-R1'), zone('R2')] });
    const problems = validateCity(files, schemas);
    expect(problems.map((p) => [p.file, p.row])).toEqual([
      ['zoning-categories.json', null],
      ['zoning.geojson', 2],
    ]);
    expect(problems.every((p) => p.reason.includes('SAMPLE-'))).toBe(true);
  });

  it('requires permit codes to start with DEMO-', () => {
    const files = sampleCity();
    const permit = (code: string) => ({
      type: 'Feature',
      properties: { permit_code: code, name: 'Fake', city_id: 'testville-sample' },
      geometry: { type: 'Polygon', coordinates: square },
    });
    // The second zone sits apart from the first, so the overlap check has nothing to say here.
    const apart = (code: string) => ({ ...permit(code), geometry: { type: 'Polygon', coordinates: [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]] } });
    files['permit-zones.geojson'] = JSON.stringify({ type: 'FeatureCollection', features: [permit('DEMO-A'), apart('A')] });
    files['rules.csv'] += '\nseg-1,L,timed_parking,,120,DEMO-A,,\nseg-1,R,timed_parking,,120,B,,';
    const problems = validateCity(files, schemas).filter((p) => p.severity === 'error' && p.reason.includes('DEMO-'));
    expect(problems.map((p) => [p.file, p.row])).toEqual([
      ['permit-zones.geojson', 2],
      ['rules.csv', 3],
    ]);
  });

  it('does not apply the fake-code prefixes to a real city', () => {
    const files = goodCity();
    files['permit-zones.geojson'] = zoneAFile();
    files['rules.csv'] += '\nseg-1,R,timed_parking,,60,A,,';
    expect(validateCity(files, schemas).filter((p) => p.severity === 'error')).toEqual([]);
  });
});

describe('permit zone checks (task M2-9)', () => {
  const rectOf = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  const permit = (code: string, coordinates: number[][][]) => ({
    type: 'Feature',
    properties: { permit_code: code, name: `Zone ${code}`, city_id: 'testville' },
    geometry: { type: 'Polygon', coordinates },
  });
  const errorsOf = (files: Record<string, string>) => validateCity(files, schemas).filter((p) => p.severity === 'error');
  const warningsOf = (files: Record<string, string>) => validateCity(files, schemas).filter((p) => p.severity === 'warning');

  // seg-1 runs west to east along y = 34.18 (L is north), 1 km long. A lies north of it, B south of it.
  function permitCity(zones = [permit('A', rectOf(-118.32, 34.18, -118.29, 34.19)), permit('B', rectOf(-118.32, 34.17, -118.29, 34.18))]) {
    const files = goodCity();
    files['segments.geojson'] = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { segment_id: 'seg-1', street: 'Main St', from_street: null, to_street: null, city_id: 'testville' },
          geometry: { type: 'LineString', coordinates: [[-118.31, 34.18], [-118.30, 34.18]] },
        },
      ],
    });
    files['permit-zones.geojson'] = JSON.stringify({ type: 'FeatureCollection', features: zones });
    files['rules.csv'] = HEADER;
    return files;
  }

  it('accepts zones that share a border, rows that name their own side\'s zone, and gives no warnings', () => {
    const files = permitCity();
    files['rules.csv'] += '\nseg-1,L,timed_parking,,60,A,,\nseg-1,R,timed_parking,,60,B,,\nseg-1,L,sweeping,,,,,';
    expect(validateCity(files, schemas)).toEqual([]);
  });

  it('marks schema problems as errors', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,X,sweeping,,,,,';
    expect(validateCity(files, schemas).every((p) => p.severity === 'error')).toBe(true);
  });

  it('rejects overlapping permit zones as an error naming both', () => {
    const files = permitCity([permit('A', rectOf(-118.32, 34.17, -118.30, 34.19)), permit('B', rectOf(-118.31, 34.17, -118.29, 34.19))]);
    const problems = errorsOf(files);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'permit-zones.geojson', row: 2 });
    expect(problems[0].reason).toMatch(/"B".*overlaps.*"A"/);
  });

  it('rejects a zone inside another zone', () => {
    const files = permitCity([permit('A', rectOf(-118.32, 34.17, -118.29, 34.19)), permit('B', rectOf(-118.31, 34.175, -118.30, 34.185))]);
    expect(errorsOf(files).map((p) => [p.file, p.row])).toEqual([['permit-zones.geojson', 2]]);
  });

  it('rejects a rule row naming a zone that is not in the permit zones file', () => {
    const files = permitCity();
    files['rules.csv'] += '\nseg-1,L,timed_parking,,60,Q,,';
    const problems = errorsOf(files);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 2 });
    expect(problems[0].reason).toMatch(/permit_code "Q".*permit-zones\.geojson/);
  });

  it('rejects a permit code when the city has no permit zones file at all', () => {
    const files = permitCity();
    delete files['permit-zones.geojson'];
    files['rules.csv'] += '\nseg-1,L,timed_parking,,60,A,,';
    const problems = errorsOf(files);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toMatch(/no permit-zones\.geojson/);
  });

  it('warns, without failing, when a row\'s code differs from the zone its side falls in', () => {
    const files = permitCity();
    files['rules.csv'] += '\nseg-1,L,timed_parking,,60,B,,'; // the L side is in A
    expect(errorsOf(files)).toEqual([]);
    const warnings = warningsOf(files);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ file: 'rules.csv', row: 2 });
    expect(warnings[0].reason).toMatch(/"B".*"A"/);
  });

  it('warns when a row\'s side is outside every zone', () => {
    const files = permitCity([permit('A', rectOf(-118.32, 34.18, -118.29, 34.19)), permit('B', rectOf(-118.40, 34.10, -118.39, 34.11))]);
    files['rules.csv'] += '\nseg-1,R,timed_parking,,60,B,,';
    const warnings = warningsOf(files);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toMatch(/outside every permit zone/);
  });

  it('warns for a block whose two ends fall in different zones', () => {
    const files = permitCity([permit('A', rectOf(-118.32, 34.17, -118.305, 34.19)), permit('B', rectOf(-118.305, 34.17, -118.29, 34.19))]);
    expect(errorsOf(files)).toEqual([]);
    const warnings = warningsOf(files).filter((p) => p.file === 'segments.geojson');
    expect(warnings.map((p) => p.row)).toEqual([1]); // one warning for the block, not one per side
    expect(warnings[0].reason).toMatch(/"seg-1".*"A".*"B"/);
  });

  it('does not warn about ends when a block lies in one zone, or in none', () => {
    expect(warningsOf(permitCity())).toEqual([]);
    expect(warningsOf(permitCity([]))).toEqual([]);
  });
});

describe('blocks.csv checks (task M5-5)', () => {
  const BLOCK_HEADER = 'segment_id,block_number,low_address,high_address,source';
  const withBlocks = (...lines: string[]) => ({ ...goodCity(), 'blocks.csv': [BLOCK_HEADER, ...lines].join('\n') });

  it('accepts a good blocks.csv, and a city without one', () => {
    expect(validateCity(withBlocks('seg-1,1200,1204,1230,osm'), schemas)).toEqual([]);
    expect(validateCity(goodCity(), schemas)).toEqual([]);
  });

  it('accepts an empty block_number', () => {
    expect(validateCity(withBlocks('seg-1,,,,osm'), schemas)).toEqual([]);
  });

  it('is not read as a rules file', () => {
    const problems = validateCity(withBlocks('seg-1,1200,1204,1230,osm'), schemas);
    expect(problems.filter((p) => p.file === 'blocks.csv')).toEqual([]);
  });

  it('rejects a segment_id that is not in segments.geojson, with the row number', () => {
    const problems = validateCity(withBlocks('seg-1,1200,1204,1230,osm', 'nope,100,101,150,osm'), schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'blocks.csv', row: 3, severity: 'error' });
    expect(problems[0].reason).toContain('nope');
  });

  it('rejects a block_number that is not a non-negative multiple of 100', () => {
    for (const bad of ['1250', '-100', '12.5', 'abc']) {
      const problems = validateCity(withBlocks(`seg-1,${bad},,,manual`), schemas);
      expect(problems.some((p) => p.file === 'blocks.csv' && p.row === 2 && p.severity === 'error'), bad).toBe(true);
    }
    expect(validateCity(withBlocks('seg-1,0,,,manual'), schemas)).toEqual([]);
  });

  it('rejects low_address above high_address', () => {
    const problems = validateCity(withBlocks('seg-1,1200,1230,1204,osm'), schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'blocks.csv', row: 2, severity: 'error' });
    expect(problems[0].reason).toContain('low_address');
  });

  it('rejects a duplicate segment_id, naming the first row', () => {
    const problems = validateCity(withBlocks('seg-1,1200,,,osm', 'seg-1,1300,,,manual'), schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'blocks.csv', row: 3, severity: 'error' });
    expect(problems[0].reason).toContain('row 2');
  });

  it('rejects an unknown source and an unknown column', () => {
    expect(validateCity(withBlocks('seg-1,1200,,,guess'), schemas).some((p) => p.row === 2 && p.severity === 'error')).toBe(true);
    const files = { ...goodCity(), 'blocks.csv': `${BLOCK_HEADER},extra\nseg-1,1200,,,osm,x` };
    expect(validateCity(files, schemas).some((p) => p.file === 'blocks.csv' && p.reason.includes('extra'))).toBe(true);
  });

  it('warns, without failing, on a segment that has no row', () => {
    const files = goodCity();
    const segs = JSON.parse(files['segments.geojson']);
    segs.features.push({ ...segs.features[0], properties: { ...segs.features[0].properties, segment_id: 'seg-2' } });
    files['segments.geojson'] = JSON.stringify(segs);
    files['blocks.csv'] = `${BLOCK_HEADER}\nseg-1,1200,1204,1230,osm`;
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'blocks.csv', severity: 'warning' });
    expect(problems[0].reason).toContain('seg-2');
  });
});
