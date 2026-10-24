import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv, validateCity } from './validate.ts';

const schemaDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');
const schemas = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(schemaDir, f), 'utf8')) as object);

const HEADER = 'segment_id,side,layer,type,limit_minutes,permit_code,color_key,schedule';
const SCHEDULE = '"{""windows"":[{""days"":[""mon""],""start"":""08:00"",""end"":""10:00""}]}"';

const square = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];

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
      `seg-1,N,sweeping,,,,,${SCHEDULE}`,
      'seg-1,S,timed_parking,,2,,,',
      'seg-1,E,curb_color,,,,red,',
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
    expect(problems[0].reason).toContain('N, S, E, W');
  });

  it('reports a segment_id that is not in segments.geojson', () => {
    const files = goodCity();
    files['rules.csv'] += '\nnope-1,N,sweeping,,,,,';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 5 });
    expect(problems[0].reason).toContain('nope-1');
  });

  it('reports a color_key that is not in the curb color config', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,W,curb_color,,,,purple,';
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
    files['rules.csv'] += '\nseg-1,N,sweeping,,,,,{not json';
    const problems = validateCity(files, schemas);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: 'rules.csv', row: 5 });
    expect(problems[0].reason).toContain('schedule');
  });

  it('reports a schedule that breaks the schedule schema', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,N,sweeping,,,,,"{""windows"":[{""days"":[""funday""],""start"":""8am"",""end"":""10:00""}]}"';
    const problems = validateCity(files, schemas);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.file === 'rules.csv' && p.row === 5)).toBe(true);
  });

  it('reports a non-integer limit_minutes and a wrong cell count', () => {
    const files = goodCity();
    files['rules.csv'] += '\nseg-1,N,timed_parking,,two,,,\nseg-1,N,sweeping';
    const problems = validateCity(files, schemas);
    expect(problems.map((p) => p.row).sort()).toEqual([5, 6]);
    expect(problems.find((p) => p.row === 5)?.reason).toContain('limit_minutes');
    expect(problems.find((p) => p.row === 6)?.reason).toContain('cells');
  });

  it('reports missing or unknown CSV columns', () => {
    const files = goodCity();
    files['rules.csv'] = 'segment_id,side,bogus\nseg-1,N,x';
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
