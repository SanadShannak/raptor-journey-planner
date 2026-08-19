// `defineConfig` comes from vitest/config rather than vite so that the `test`
// block below is actually read and type-checked; vite's own export ignores it.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
