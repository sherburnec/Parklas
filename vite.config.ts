import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project path.
  base: './',
  // Lets the page read DATA_SET (sample or real) the same way the data scripts do.
  envPrefix: ['VITE_', 'DATA_'],
  build: {
    // authoring.html is a separate entry (task M2-7). The public page does not link to or import it.
    rollupOptions: { input: { main: 'index.html', authoring: 'authoring.html' } },
  },
});
