/*
 * Arabic shaping and right-to-left ordering, registered inside MapLibre's
 * worker.
 *
 * Not imported by the app. `MapCanvas.tsx` hands MapLibre this file's URL, and
 * the worker imports it the first time a tile carries right-to-left text. It
 * has to register itself: MapLibre waits for `registerRTLTextPlugin` to be
 * called and, until it is, **drops** every label containing Arabic rather than
 * drawing it unshaped. A plugin that loads but never registers therefore
 * empties the map of Arabic, which is a worse failure than the disconnected
 * letters this exists to fix.
 *
 * The WebAssembly is passed by a URL Vite resolves, not found through the
 * package's own `import.meta.url`, which does not survive the dev server's
 * dependency pre-bundling.
 */
import { createRTL } from '@mapbox/mapbox-gl-rtl-text/rtl.js';
import wasmUrl from '@mapbox/mapbox-gl-rtl-text/mapbox-gl-rtl-text.wasm?url';

type RTL = Awaited<ReturnType<typeof createRTL>>;

const worker = self as unknown as { registerRTLTextPlugin(plugin: RTL): void };

worker.registerRTLTextPlugin(await createRTL(fetch(wasmUrl)));
