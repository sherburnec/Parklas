import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRoute } from '../../src/data-loader/route.ts';
import { chooserPage, dataFolders, notFoundPage, redirectPage, routeEntries, siteBase } from './routes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function dataDir(layout: Record<string, string[]>): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'routes-'));
  made.push(dir);
  for (const [folder, files] of Object.entries(layout)) {
    mkdirSync(resolve(dir, folder));
    for (const f of files) writeFileSync(resolve(dir, folder, f), '{}');
  }
  writeFileSync(resolve(dir, 'README.md'), 'not a folder');
  return dir;
}

describe('dataFolders', () => {
  it('lists every city folder under data/, sample or not, sorted', () => {
    const dir = dataDir({ 'burbank-sample': ['city.json'], burbank: ['city.json'], other: ['city.json'] });
    expect(dataFolders(dir)).toEqual(['burbank', 'burbank-sample', 'other']);
  });

  it('skips directories without a city.json and names that are not valid folder names', () => {
    const dir = dataDir({ burbank: ['city.json'], empty: [], 'Bad Name': ['city.json'] });
    expect(dataFolders(dir)).toEqual(['burbank']);
  });

  it('gives a new data folder its routes with no other change', () => {
    const dir = dataDir({ burbank: ['city.json'], pasadena: ['city.json'] });
    expect(routeEntries(dataFolders(dir))).toEqual({
      'burbank/index': 'burbank/index.html',
      'burbank/authoring': 'burbank/authoring.html',
      'pasadena/index': 'pasadena/index.html',
      'pasadena/authoring': 'pasadena/authoring.html',
    });
  });
});

describe('redirectPage', () => {
  it('goes to the folder relative to the page, keeping the query and hash', () => {
    const html = redirectPage('burbank-sample/');
    expect(html).toContain('location.replace("./burbank-sample/"');
    expect(html).toContain('location.search');
    expect(html).toContain('location.hash');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=./burbank-sample/">');
  });

  it('can point at a folder\'s authoring page', () => {
    expect(redirectPage('burbank-sample/authoring.html')).toContain('./burbank-sample/authoring.html');
  });
});

describe('notFoundPage', () => {
  it('lists a link to every folder, under the site base', () => {
    const html = notFoundPage(['burbank', 'burbank-sample'], '/Parklas/');
    expect(html).toContain('href="/Parklas/burbank/"');
    expect(html).toContain('href="/Parklas/burbank-sample/"');
    expect(html).not.toContain('authoring');
  });

  it('is a complete page', () => {
    expect(notFoundPage(['burbank'], '/')).toMatch(/^<!doctype html>/i);
  });
});

describe('siteBase', () => {
  it('defaults to the root and always starts and ends with a slash', () => {
    expect(siteBase(undefined)).toBe('/');
    expect(siteBase('')).toBe('/');
    expect(siteBase('Parklas')).toBe('/Parklas/');
    expect(siteBase('/Parklas/')).toBe('/Parklas/');
  });
});

describe('every generated route is read back by parseRoute', () => {
  it('maps each route entry to its folder and page', () => {
    for (const key of Object.keys(routeEntries(['burbank', 'burbank-sample']))) {
      const [folder, page] = key.split('/');
      expect(parseRoute(`/${folder}/${page}.html`)).toMatchObject({ folder, page });
    }
  });
});

describe('config/site.json', () => {
  const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<string, unknown>;
  const schema = read('schemas/site-config.schema.json');
  const config = read('config/site.json');

  it('passes its JSON Schema', () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    expect(validate(config), JSON.stringify(validate.errors)).toBe(true);
  });

  it('is rejected when the default folder is missing or not a valid name', () => {
    const validate = new Ajv().compile(schema);
    expect(validate({})).toBe(false);
    expect(validate({ default_folder: 'Bad Name' })).toBe(false);
    expect(validate({ default_folder: 'burbank', extra: 1 })).toBe(false);
  });

  it('names a folder that exists under data/', () => {
    expect(dataFolders(resolve(root, 'data'))).toContain(config.default_folder);
  });
});

describe('chooserPage', () => {
  it('links to every folder relative to the site root, so it works under any project path', () => {
    const html = chooserPage(['burbank', 'burbank-sample'], 'burbank-sample');
    expect(html).toContain('href="./burbank/"');
    expect(html).toContain('href="./burbank-sample/"');
    expect(html).toMatch(/^<!doctype html>/i);
  });

  it('marks the default folder and never links to an authoring page', () => {
    const html = chooserPage(['burbank', 'burbank-sample'], 'burbank-sample');
    expect(html).toMatch(/burbank-sample<\/a>\s*\(default\)/);
    expect(html).not.toMatch(/burbank<\/a>\s*\(default\)/);
    expect(html).not.toContain('authoring');
  });
});
