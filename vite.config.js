import { defineConfig } from 'vite';

// User site at https://lstuek.github.io: base path "/".
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'es2022',
    chunkSizeWarningLimit: 1024,
  },
});
