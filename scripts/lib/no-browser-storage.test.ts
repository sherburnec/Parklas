// Architecture rule 4 (task M5-4): nothing may use browser storage, so nothing breaks when it is blocked.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const scanned = ['src', 'spike'];
const storage = /\b(?:localStorage|sessionStorage|indexedDB|IDBFactory|openDatabase|caches\s*\.\s*open|serviceWorker)\b/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p);
    return /\.(ts|js|html)$/.test(e.name) ? [p] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const usesStorage = (source: string) => storage.test(stripComments(source));

describe('usesStorage (the checker itself)', () => {
  it('catches each storage API', () => {
    expect(usesStorage(`localStorage.setItem('a', 'b');`)).toBe(true);
    expect(usesStorage(`window.sessionStorage.getItem('a');`)).toBe(true);
    expect(usesStorage(`indexedDB.open('x');`)).toBe(true);
  });

  it('ignores comments and similar words', () => {
    expect(usesStorage(`// Nothing goes to localStorage`)).toBe(false);
    expect(usesStorage(`/* sessionStorage */ const a = 1;`)).toBe(false);
    expect(usesStorage(`const storageKey = 1;`)).toBe(false);
  });
});

describe('browser storage', () => {
  it('is not used by the public app, the authoring page or the spike pages', () => {
    const pages = ['index.html', 'authoring.html'].map((f) => join(root, f));
    const used = [...pages, ...scanned.flatMap((d) => files(join(root, d)))].filter((f) =>
      usesStorage(readFileSync(f, 'utf8')),
    );
    expect(used).toEqual([]);
  });
});
