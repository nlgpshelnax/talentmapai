import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Tailwind is wired through its official Vite plugin.
 * The prototype used the PostCSS path with a v3 config file that v4 ignored,
 * plus a redundant autoprefixer — that combination is why no custom token
 * (fonts, cosmic palette) ever reached the browser.
 *
 * `base` is configurable because the GitHub Pages demo is served from a
 * subdirectory (/<repo>/), while the real deployment is served from the root.
 */
export default defineConfig(({ mode }) => {
  const isDemo = process.env.VITE_DEMO === '1';

  return {
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE || '/',
  resolve: {
    alias: {
      // The in-browser backend is only linked into the GitHub Pages build;
      // otherwise «@demo» resolves to a stub so the ~140 KB data snapshot
      // never reaches the production bundle.
      '@demo': fileURLToPath(new URL(isDemo ? './src/demo/index.js' : './src/demo/noop.js', import.meta.url)),
    },
  },
  define: {
    // Surfaced in the UI so a published demo can be labelled honestly.
    __BUILD_MODE__: JSON.stringify(mode),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  };
});
