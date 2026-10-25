// Architecture rule 1 (task M5-3): everything outside src/basemap reaches it only through src/basemap/index.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const basemapDir = resolve(root, 'src', 'basemap');
const scanned = ['src', 'spike', 'scripts'];

function files(dir: string, extension: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p, extension);
    return extension.test(e.name) ? [p] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Every module specifier in static imports, re-exports, dynamic imports and require calls. */
function specifiers(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const re of [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const m of code.matchAll(re)) found.push(m[1]);
  }
  return found;
}

/** True if `specifier`, written in `fromFile`, lands inside src/basemap on anything but its index. */
function reachesBasemapInternals(specifier: string, fromFile: string): boolean {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return false;
  const target = specifier.startsWith('/') ? resolve(root, specifier.slice(1)) : resolve(dirname(fromFile), specifier);
  if (target !== basemapDir && !target.startsWith(basemapDir + sep)) return false;
  return !['', '/index', '/index.ts', '/index.js'].includes(target.slice(basemapDir.length).replaceAll('\\', '/'));
}

const bad = (source: string, from = resolve(root, 'src', 'layers', 'x.ts')) =>
  specifiers(source).filter((s) => reachesBasemapInternals(s, from));

describe('reachesBasemapInternals (the checker itself)', () => {
  it('allows the index in every spelling', () => {
    expect(bad(`import { createBasemap } from '../basemap';`)).toEqual([]);
    expect(bad(`import { createBasemap } from '../basemap/';`)).toEqual([]);
    expect(bad(`import type { Basemap } from '../basemap/index';`)).toEqual([]);
    expect(bad(`export { a } from '../basemap/index.ts';`)).toEqual([]);
  });

  it('catches internals through each import form', () => {
    expect(bad(`import { tagCoverage } from '../basemap/coverage';`)).toHaveLength(1);
    expect(bad(`import * as b from '../basemap/basemap';`)).toHaveLength(1);
    expect(bad(`export { x } from '../basemap/coverage';`)).toHaveLength(1);
    expect(bad(`import '../basemap/basemap';`)).toHaveLength(1);
    expect(bad(`const m = await import('../basemap/basemap');`)).toHaveLength(1);
    expect(bad(`const m = require('../basemap/coverage');`)).toHaveLength(1);
    expect(bad(`import { a } from '../../src/basemap/coverage';`, resolve(root, 'scripts', 'lib', 'x.ts'))).toHaveLength(1);
  });

  it('ignores comments and other modules', () => {
    expect(bad(`// import { a } from '../basemap/coverage';\nimport { b } from '../basemapper/x';`)).toEqual([]);
    expect(bad(`import { b } from 'maplibre-gl';`)).toEqual([]);
  });
});

describe('architecture rule 1', () => {
  it('has no import of basemap internals from outside src/basemap', () => {
    const found: string[] = [];
    for (const dir of scanned) {
      for (const file of files(resolve(root, dir), /\.(?:ts|js|mjs)$/)) {
        if (file.startsWith(basemapDir + sep) || file === fileURLToPath(import.meta.url)) continue;
        for (const s of specifiers(readFileSync(file, 'utf8'))) {
          if (reachesBasemapInternals(s, file)) found.push(`${relative(root, file)}: ${s}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('has no page script that loads basemap internals', () => {
    const found: string[] = [];
    const pages = [root, resolve(root, 'spike')].flatMap((dir) =>
      readdirSync(dir).filter((n) => n.endsWith('.html')).map((n) => join(dir, n)),
    );
    expect(pages.map((p) => relative(root, p))).toEqual(expect.arrayContaining(['index.html', 'authoring.html']));
    for (const page of pages) {
      for (const m of readFileSync(page, 'utf8').matchAll(/<script[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/g)) {
        if (reachesBasemapInternals(m[1].startsWith('/') ? m[1] : `./${m[1]}`, page)) found.push(`${relative(root, page)}: ${m[1]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('scans the public app and the authoring page', () => {
    // Guards against the scan silently covering nothing (for example after a folder move).
    const scannedFiles = files(resolve(root, 'src'), /\.ts$/).map((f) => relative(root, f).replaceAll('\\', '/'));
    expect(scannedFiles).toContain('src/main.ts');
    expect(scannedFiles).toContain('src/authoring/main.ts');
  });
});
