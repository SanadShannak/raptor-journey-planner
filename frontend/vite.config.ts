// `defineConfig` comes from vitest/config rather than vite so that the `test`
// block below is actually read and type-checked; vite's own export ignores it.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /*
   * MapLibre is left out of dependency pre-bundling.
   *
   * It ships its renderer as a web worker, and the rewritten import that
   * pre-bundling produces does not resolve at run time — the worker 404s, the
   * map never finishes initialising, and what you get is a correctly-sized
   * canvas that stays blank. No error is thrown and nothing appears in the
   * console beyond the failed request, which makes it look like a styling
   * problem rather than a build one.
   */
  optimizeDeps: { exclude: ['maplibre-gl'] },
  /*
   * The map's worker is bundled as an ES module (see `MapCanvas.tsx`). Vite's
   * default for workers is a classic script, which cannot carry the `import`
   * statements MapLibre's worker entry is written with.
   */
  worker: { format: 'es' },
  build: {
    /*
     * Baseline browser support, kept deliberately explicit rather than left to
     * Vite's default. These versions all ship the platform features the app
     * relies on — `fetch`, `AbortSignal.timeout`, `Array.prototype.at`, and
     * CSS logical properties — which is what makes the small set of manual
     * fallbacks in the code sufficient.
     *
     * Widening this is a real decision: it changes which fallbacks are needed.
     */
    target: ['es2022', 'chrome111', 'edge111', 'firefox113', 'safari15.4'],
  },
  test: {
    environment: 'jsdom',
    /*
     * Every test gets the map stub, not MapLibre.
     *
     * A GL map needs a WebGL context and jsdom has none, so the real module
     * throws on construction — which is not a thing any test wants to assert
     * and is not something a per-file mock should have to remember. Aliased
     * once here so a page that merely *contains* a map can be tested for the
     * things it is actually about.
     *
     * The stub records what the map was told to do, which is what the map
     * tests read. See `src/test/mapStub.ts`.
     */
    alias: [
      {
        find: /^maplibre-gl$/,
        replacement: fileURLToPath(new URL('./src/test/mapStub.ts', import.meta.url)),
      },
    ],
    // jsdom refuses to expose localStorage on an opaque origin, which is what
    // the default about:blank URL gives you. A real origin turns it back on.
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Vite only loads .env.development in dev mode, and src/config/env.ts
    // deliberately throws when the base URL is missing. Supplying it here keeps
    // the fail-fast behaviour intact while giving tests a fixed origin to
    // assert request URLs against.
    env: { VITE_API_BASE_URL: 'http://api.test' },
  },
});
