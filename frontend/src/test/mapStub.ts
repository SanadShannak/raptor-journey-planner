/**
 * A MapLibre stand-in for jsdom.
 *
 * A GL map needs a WebGL context, and jsdom has none — `new Map()` throws
 * before a single assertion runs. So the module is replaced wholesale, which
 * is the same bargain the Leaflet tests struck when they spied on `setView`:
 * what is being tested is *what the map was told to do*, not that MapLibre
 * does it, and that is readable from the calls alone.
 *
 * Two things the stub must get right or the tests are theatre. It fires `load`
 * and `style.load` synchronously on construction, because `MapCanvas` renders
 * no children until the map has loaded — a stub that never fired them would
 * make every test pass by drawing nothing. And a `Marker` really appends its
 * element to the container, so markers stay assertable through the DOM by
 * accessible name, which is how the rest of the suite queries.
 *
 * Screen-space projection is a plain scale rather than a real Mercator one.
 * jsdom has no layout, so no test can depend on a true projection anyway; what
 * the thinning and collision code needs is only that two points far apart in
 * degrees are far apart in pixels, monotonically.
 */

export interface StubLayer {
  id: string;
  source: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown;
}

/** Every framing call the map was asked to make, in order. */
export interface Move {
  kind: 'easeTo' | 'fitBounds' | 'jumpTo';
  center?: [number, number] | undefined;
  zoom?: number | undefined;
  bounds?: [[number, number], [number, number]] | undefined;
}

type Listener = (event: unknown) => void;

export class StubGeoJSONSource {
  data: unknown;
  constructor(data: unknown) {
    this.data = data;
  }
  setData(data: unknown): void {
    this.data = data;
  }
}

export class StubMap {
  moves: Move[] = [];
  sources = new Map<string, StubGeoJSONSource>();
  layers = new Map<string, StubLayer>();
  style: string;
  removed = false;

  private zoom: number;
  private center: [number, number];
  private listeners = new Map<string, Set<Listener>>();
  private canvas = document.createElement('canvas');
  private container: HTMLElement;

  constructor(options: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
  }) {
    this.container = options.container;
    this.style = options.style;
    this.center = options.center;
    this.zoom = options.zoom;
    created.push(this);

    /*
     * Fired on a microtask rather than inline. The constructor has not
     * returned yet, so a listener attached on the next line would miss an
     * event dispatched here — which is exactly how `MapCanvas` subscribes.
     */
    queueMicrotask(() => {
      this.fire('load');
      this.fire('style.load');
    });
  }

  on(type: string, a: unknown, b?: unknown): this {
    // `on('click', layerId, handler)` is the three-argument form; the layer is
    // not modelled, so the handler is registered against the bare event.
    const handler = (typeof a === 'function' ? a : b) as Listener;
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(handler);
    this.listeners.set(type, set);
    return this;
  }

  off(type: string, a: unknown, b?: unknown): this {
    this.assertUsable('off');
    const handler = (typeof a === 'function' ? a : b) as Listener;
    this.listeners.get(type)?.delete(handler);
    return this;
  }

  /** Drives the map from a test: `map.fire('moveend')`. */
  fire(type: string, event: unknown = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  getZoom(): number {
    return this.zoom;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  getCenter(): { lat: number; lng: number } {
    return { lng: this.center[0], lat: this.center[1] };
  }

  getBounds() {
    const [lng, lat] = this.center;
    // A degree either way, which is plenty to contain any fixture.
    return {
      getNorth: () => lat + 1,
      getSouth: () => lat - 1,
      getEast: () => lng + 1,
      getWest: () => lng - 1,
    };
  }

  project([lng, lat]: [number, number]): { x: number; y: number } {
    return { x: lng * 1000, y: -lat * 1000 };
  }

  unproject([x, y]: [number, number]): { lat: number; lng: number } {
    return { lng: x / 1000, lat: -y / 1000 };
  }

  easeTo(options: { center?: [number, number]; zoom?: number }): void {
    if (options.center !== undefined) this.center = options.center;
    if (options.zoom !== undefined) this.zoom = options.zoom;
    this.moves.push({ kind: 'easeTo', center: options.center, zoom: options.zoom });
  }

  jumpTo(options: { center?: [number, number]; zoom?: number }): void {
    if (options.center !== undefined) this.center = options.center;
    if (options.zoom !== undefined) this.zoom = options.zoom;
    this.moves.push({ kind: 'jumpTo', center: options.center, zoom: options.zoom });
  }

  fitBounds(
    bounds: [[number, number], [number, number]],
    options?: { maxZoom?: number },
  ): void {
    const [[west, south], [east, north]] = bounds;
    this.center = [(west + east) / 2, (south + north) / 2];
    if (options?.maxZoom !== undefined) this.zoom = options.maxZoom;
    this.moves.push({ kind: 'fitBounds', bounds });
  }

  setStyle(style: string): void {
    this.style = style;
    // A real style swap discards every source and layer, and this must too —
    // the re-adding is the behaviour under test.
    this.sources.clear();
    this.layers.clear();
    queueMicrotask(() => this.fire('style.load'));
  }

  isStyleLoaded(): boolean {
    return true;
  }

  addSource(id: string, source: { type: string; data: unknown }): void {
    // Wrapped rather than stored raw, so `useGeoJson`'s `instanceof` check —
    // which is what lets it take the cheap `setData` path — is reachable.
    this.sources.set(id, new StubGeoJSONSource(source.data));
  }

  getSource(id: string): StubGeoJSONSource | undefined {
    return this.sources.get(id);
  }

  removeSource(id: string): void {
    this.assertUsable('removeSource');
    this.sources.delete(id);
  }

  addLayer(layer: StubLayer): void {
    this.layers.set(layer.id, layer);
  }

  getLayer(id: string): StubLayer | undefined {
    return this.layers.get(id);
  }

  removeLayer(id: string): void {
    this.assertUsable('removeLayer');
    this.layers.delete(id);
  }

  /**
   * What a press finds under it.
   *
   * Set by a test — there is no rendering here, so nothing can be genuinely
   * hit-tested. Each entry names the layer it belongs to, and the query
   * returns only those the caller asked about, which is the part worth
   * modelling: a handler that queried the wrong layer would otherwise pass.
   */
  hits: { layer: string; properties: Record<string, unknown> }[] = [];

  queryRenderedFeatures(
    _point: unknown,
    options?: { layers?: string[] },
  ): { properties: Record<string, unknown> }[] {
    const wanted = options?.layers;
    return this.hits.filter((hit) => wanted === undefined || wanted.includes(hit.layer));
  }

  addControl(): this {
    return this;
  }

  removeControl(): this {
    this.assertUsable('removeControl');
    return this;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  resize(): void {}

  remove(): void {
    this.removed = true;
    this.listeners.clear();
  }

  /**
   * Refuses anything asked of a destroyed map, exactly as the real one does.
   *
   * This is the whole point of the stub having a `removed` flag. MapLibre
   * tears its internals down in `remove()`, so a later `off` or
   * `removeControl` dereferences something that is gone — and because React
   * runs a component's cleanups in declaration order, and unmounts a deleted
   * subtree parent first, the map is destroyed *before* every cleanup that
   * wants to tidy up after itself.
   *
   * That throw is not contained: it takes the unmount with it, and the symptom
   * is a blank page after navigating away from a map — nowhere near the map,
   * and long after the thing that caused it. A stub that quietly accepted
   * these calls would let that bug back in with every test still green.
   */
  private assertUsable(what: string): void {
    if (this.removed) {
      throw new TypeError(`Cannot ${what} on a removed map.`);
    }
  }
}

/** The marker really mounts its element, so the DOM stays assertable. */
export class StubMarker {
  element: HTMLElement;
  lngLat: [number, number] = [0, 0];
  private map: StubMap | null = null;

  constructor(options: { element: HTMLElement }) {
    this.element = options.element;
  }

  setLngLat(position: [number, number]): this {
    this.lngLat = position;
    return this;
  }

  addTo(map: StubMap): this {
    this.map = map;
    map.getContainer().appendChild(this.element);
    return this;
  }

  remove(): this {
    if (this.map?.removed === true) {
      throw new TypeError('Cannot remove a marker from a removed map.');
    }
    this.element.remove();
    return this;
  }
}


/** Every map constructed since the file was loaded; the last is the live one. */
export const created: StubMap[] = [];

/** The map a test is driving — the most recently constructed one. */
export function liveMap(): StubMap {
  const map = created[created.length - 1];
  if (map === undefined) throw new Error('No map has been constructed.');
  return map;
}

export function forgetMaps(): void {
  created.length = 0;
}

/*
 * The names `maplibre-gl` itself exports, so a test file can replace the whole
 * module with this one:
 *
 *     vi.mock('maplibre-gl', () => import('../test/mapStub'));
 *
 * The factory imports rather than closing over anything, which is what keeps
 * it legal under `vi.mock`'s hoisting.
 */
export {
  StubMap as Map,
  StubMarker as Marker,
  StubGeoJSONSource as GeoJSONSource,
};

export class NavigationControl {}
export class AttributionControl {}

/** Where the real module keeps `WORKER_URL`; written to, never read here. */
export const config: { WORKER_URL: string | null } = { WORKER_URL: null };
