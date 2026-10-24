// Architecture rule 3 (task M3-1): data is fetched only through data-loader.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const loaderDir = resolve(root, 'src', 'data-loader');
const scanned = ['src', 'spike', 'scripts'];

// Network calls, and data files pulled straight into the app bundle, both bypass the loader.
// The throwaway spike/ page is not the app, so only the network checks apply to it.
const DATA_IMPORT = 'data file import';
const FORBIDDEN: [string, RegExp][] = [
  ['fetch()', /(?<![\w.$])fetch\s*\(/],
  ['window/globalThis.fetch', /\b(?:window|globalThis|self)\s*\.\s*fetch\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['EventSource', /\bEventSource\b/],
  [DATA_IMPORT, /from\s+['"][^'"]*\bdata\/[^'"]*\.(?:geojson|json|csv)(?:\?[^'"]*)?['"]/],
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p);
    return /\.(?:ts|js|mjs)$/.test(e.name) ? [p] : [];
  });
}

/** Drop comments and string-free noise so a comment that mentions fetch() is not a hit. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function violations(source: string, inApp = true): string[] {
  const code = stripComments(source);
  return FORBIDDEN.filter(([name, re]) => (inApp || name !== DATA_IMPORT) && re.test(code)).map(([name]) => name);
}

describe('violations (the checker itself)', () => {
  it('catches each kind of bypass', () => {
    expect(violations(`const r = await fetch('/x');`)).toContain('fetch()');
    expect(violations(`window.fetch(u)`)).toContain('window/globalThis.fetch');
    expect(violations(`new XMLHttpRequest()`)).toContain('XMLHttpRequest');
    expect(violations(`import s from '../../data/burbank/segments.geojson?raw';`)).toContain('data file import');
  });

  it('ignores comments and unrelated names', () => {
    expect(violations(`// fetch() belongs to data-loader\n/* fetch(x) */ const a = prefetch(1); obj.fetch(2);`)).toEqual([]);
  });
});

describe('architecture rule 3', () => {
  it('finds no fetch or direct data import outside data-loader', () => {
    const found: string[] = [];
    for (const dir of scanned) {
      for (const file of files(resolve(root, dir))) {
        if (file.startsWith(loaderDir + sep) || file === fileURLToPath(import.meta.url)) continue;
        for (const v of violations(readFileSync(file, 'utf8'), dir === 'src')) found.push(`${relative(root, file)}: ${v}`);
      }
    }
    expect(found).toEqual([]);
  });
});
