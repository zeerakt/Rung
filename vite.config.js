import { defineConfig } from 'vite';

// Configured specifically for GitHub Pages deployment at https://zeerakt.github.io/rung/
export default defineConfig({
  base: '/rung/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
