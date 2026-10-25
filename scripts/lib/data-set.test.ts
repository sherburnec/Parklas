import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCityFiles, parseDataSet, passThroughFiles, selectCities, sourceCityOf } from './data-set.ts';

describe('parseDataSet', () => {
  it('defaults to sample when unset or empty', () => {
    expect(parseDataSet(undefined)).toBe('sample');
    expect(parseDataSet('')).toBe('sample');
  });

  it('accepts sample and real', () => {
    expect(parseDataSet('sample')).toBe('sample');
    expect(parseDataSet('real')).toBe('real');
  });

  it('rejects anything else, naming the setting', () => {
    expect(() => parseDataSet('prod')).toThrow(/DATA_SET.*sample.*real/);
  });
});

describe('sample folder naming', () => {
  it('maps a sample folder to its source city', () => {
    expect(sourceCityOf('burbank-sample')).toBe('burbank');
    expect(sourceCityOf('burbank')).toBeNull();
  });

  it('picks sample folders or real folders, never both', () => {
    const all = ['burbank', 'burbank-sample', 'other'];
    expect(selectCities(all, 'sample')).toEqual(['burbank-sample']);
    expect(selectCities(all, 'real')).toEqual(['burbank', 'other']);
  });
});

describe('loadCityFiles', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'parklas-'));
    mkdirSync(join(dir, 'burbank'));
    mkdirSync(join(dir, 'burbank-sample'));
    writeFileSync(join(dir, 'burbank', 'segments.geojson'), '{"type":"FeatureCollection","features":[]}');
    writeFileSync(join(dir, 'burbank', 'city.json'), '{"real":true}');
    writeFileSync(join(dir, 'burbank-sample', 'city.json'), '{"sample":true}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a real city folder as it is', () => {
    expect(Object.keys(loadCityFiles(dir, 'burbank')).sort()).toEqual(['city.json', 'segments.geojson']);
  });


  it('skips Markdown notes such as test-cases.md, which are not data', () => {
    writeFileSync(join(dir, 'burbank-sample', 'test-cases.md'), '# notes');
    expect(Object.keys(loadCityFiles(dir, 'burbank-sample')).sort()).toEqual(['city.json', 'segments.geojson']);
  });

  it('supplies segments.geojson from the source city to a sample folder without a copy', () => {
    const files = loadCityFiles(dir, 'burbank-sample');
    expect(files['city.json']).toBe('{"sample":true}');
    expect(files['segments.geojson']).toBe('{"type":"FeatureCollection","features":[]}');
  });

  it("does not override a sample folder's own segments file", () => {
    writeFileSync(join(dir, 'burbank-sample', 'segments.geojson'), 'own');
    expect(loadCityFiles(dir, 'burbank-sample')['segments.geojson']).toBe('own');
  });

  it('supplies trim.json from the source city the same way, and copes with the source not having one yet', () => {
    writeFileSync(join(dir, 'burbank', 'trim.json'), '{"city_id":"burbank","segments":{}}');
    expect(loadCityFiles(dir, 'burbank-sample')['trim.json']).toBe('{"city_id":"burbank","segments":{}}');
    rmSync(join(dir, 'burbank', 'trim.json'));
    expect('trim.json' in loadCityFiles(dir, 'burbank-sample')).toBe(false);
  });

  it("does not override a sample folder's own trim.json", () => {
    writeFileSync(join(dir, 'burbank', 'trim.json'), 'source');
    writeFileSync(join(dir, 'burbank-sample', 'trim.json'), 'own');
    expect(loadCityFiles(dir, 'burbank-sample')['trim.json']).toBe('own');
  });

  it('throws when the source city has no segments file', () => {
    rmSync(join(dir, 'burbank', 'segments.geojson'));
    expect(() => loadCityFiles(dir, 'burbank-sample')).toThrow(/data\/burbank\/segments\.geojson/);
  });
});

describe('passThroughFiles', () => {
  it('lists the authored files the folder has, and never rules.csv or segments', () => {
    const files = { 'city.json': '{}', 'rules.csv': '', 'segments.geojson': '{}', 'curb-colors.json': '{}' };
    expect(passThroughFiles(files)).toEqual(['city.json', 'curb-colors.json']);
  });
});
