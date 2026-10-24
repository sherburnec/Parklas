import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project path.
  base: './',
  // Lets the page read DATA_SET (sample or real) the same way the data scripts do.
  envPrefix: ['VITE_', 'DATA_'],
});
