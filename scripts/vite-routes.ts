/// <reference types="node" />
// Vite plugin for the city routes (task M5-7). The two page templates, index.html and authoring.html, are built once per
// folder under data/, so the build writes dist/<folder>/index.html and dist/<folder>/authoring.html: real files on
// GitHub Pages. It also writes the root chooser page, the /authoring.html redirect and 404.html. The dev server serves the same routes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { chooserPage, dataFolders, notFoundPage, redirectPage, routeEntries, siteBase } from './lib/routes.ts';

export function cityRoutes(): Plugin {
  let root = '';
  let folders: string[] = [];
  let defaultFolder = '';
  const template = (page: string) => readFileSync(resolve(root, `${page}.html`), 'utf8');
  /** Absolute path of a generated page to its template name, e.g. <root>/burbank/authoring.html to "authoring". */
  const pages = new Map<string, string>();

  return {
    name: 'city-routes',
    enforce: 'pre',
    config(userConfig) {
      root = resolve(userConfig.root ?? process.cwd());
      folders = dataFolders(resolve(root, 'data'));
      const site = JSON.parse(readFileSync(resolve(root, 'config', 'site.json'), 'utf8')) as { default_folder: string };
      defaultFolder = site.default_folder;
      if (!folders.includes(defaultFolder)) {
        throw new Error(`config/site.json: default_folder "${defaultFolder}" is not a folder under data/ (${folders.join(', ')})`);
      }
      const input: Record<string, string> = {};
      for (const [key, path] of Object.entries(routeEntries(folders))) {
        const absolute = resolve(root, path);
        input[key] = absolute;
        pages.set(absolute, key.endsWith('/authoring') ? 'authoring' : 'index');
      }
      return { build: { rollupOptions: { input } } };
    },
    resolveId(id) {
      return pages.has(id) ? id : null;
    },
    load(id) {
      const page = pages.get(id);
      return page === undefined ? null : template(page);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'index.html', source: chooserPage(folders, defaultFolder) });
      this.emitFile({ type: 'asset', fileName: 'authoring.html', source: redirectPage(`${defaultFolder}/authoring.html`) });
      this.emitFile({ type: 'asset', fileName: '404.html', source: notFoundPage(folders, siteBase(process.env.SITE_BASE)) });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const [path, query = ''] = (req.url ?? '').split('?');
        const search = query ? `?${query}` : '';
        const redirect = (to: string) => {
          res.statusCode = 302;
          res.setHeader('Location', `${to}${search}`);
          res.end();
        };
        if (path === '/' || path === '/index.html') {
          res.setHeader('Content-Type', 'text/html');
          res.end(chooserPage(folders, defaultFolder));
          return;
        }
        if (path === '/authoring.html') return redirect(`/${defaultFolder}/authoring.html`);
        const m = /^\/([a-z0-9_-]+)(\/(?:index\.html|authoring\.html)?)?$/.exec(path);
        if (!m || !folders.includes(m[1])) return next();
        if (m[2] === undefined) return redirect(`/${m[1]}/`);
        const html = await server.transformIndexHtml(path, template(m[2].endsWith('authoring.html') ? 'authoring' : 'index'));
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      });
    },
  };
}
