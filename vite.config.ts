import { defineConfig } from 'vite';
import { cityRoutes } from './scripts/vite-routes.ts';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project path.
  base: './',
  // One set of pages per data folder, the root redirects and 404.html (task M5-7). The authoring pages are not linked from the public ones.
  plugins: [cityRoutes()],
});
