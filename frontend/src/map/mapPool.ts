import { Map as GlMap, type MapOptions } from 'maplibre-gl';

/**
 * The one map, kept alive between pages.
 *
 * Three pages draw a map and only ever one at a time, and each used to build
 * its own from nothing on the way in and destroy it on the way out. What that
 * costs is not the object — it is everything the object had learned. A GL map
 * accumulates a style document, a worker pool, parsed vector tiles and the
 * textures made from them, and all of it went in the bin on every navigation,
 * to be fetched and parsed again a moment later.
 *
 * Measured on this app, arriving at the stops page took about a second before
 * anything was drawn, against under a tenth of that for a page whose tiles the
 * previous one happened to share. The gap is the tile cache: the stops page
 * opens at street level and nothing gathered at city level fits it.
 *
 * So the map outlives the component. `MapCanvas` borrows it on mount and hands
 * it back on unmount, and what the reader sees between two map pages is a map
 * that moves rather than a panel that fills in. Tiles it already holds are
 * drawn immediately — scaled from a neighbouring zoom while the exact ones
 * arrive, which is the blur-then-sharpen every map does and which reads as the
 * map working rather than the map loading.
 *
 * **Module-level, not storage, and deliberately.** It lives exactly as long as
 * the tab runs the same JavaScript — the same bargain `plannerMemory` makes,
 * for the same reason: come back to a page and it is where you left it; reload
 * and you get a new one. This is a cache, and a cache that survives a refresh
 * is one nobody asked to keep.
 *
 * **And not for ever.** A map held while nobody is looking at one costs real
 * memory — a WebGL context, its textures, a worker pool — for a page that has
 * no map on it. So the hold has a deadline: see {@link IDLE_MS}.
 *
 * The container is the pool's too. A map cannot be re-parented by handing it a
 * different element, so the element travels with it: `MapCanvas` renders a
 * wrapper and moves this node inside, which is a DOM append rather than
 * anything the map has to be told about.
 */
interface Pooled {
  map: GlMap;
  /** The element the map was built in, moved between pages with it. */
  container: HTMLDivElement;
  /** The style it currently has, so a scheme changed while away is noticed. */
  style: string;
  /**
   * How far along the map is, tracked here rather than guessed at by whoever
   * borrows it.
   *
   * "Borrowed" and "ready" are not the same thing, and assuming they were cost
   * a blank page: StrictMode mounts, unmounts and mounts again immediately, so
   * the second borrow gets a map created milliseconds earlier that has not
   * finished starting. Told the style was ready, the layers went on and
   * MapLibre threw `Style is not done loading` — which, in a passive effect,
   * takes the whole render down.
   *
   * MapLibre's own `isStyleLoaded()` cannot answer this either: it is false
   * while any *source* is loading, and a page's own overlays are sources. So
   * the pool listens once and remembers.
   */
  loaded: boolean;
  styleReady: boolean;
  drawn: boolean;
}

/**
 * How long the map is kept after the last page that wanted one let it go.
 *
 * The pool exists to make moving between map pages free, and that movement is
 * measured in the second or two it takes to press a link and read the next
 * page. Half a minute covers that generously while still being far shorter
 * than any stretch spent reading a card balance or a list of favourites — the
 * cases where holding a rendering engine open is simply waste.
 *
 * Letting it go is not free either: coming back after the deadline rebuilds
 * the map from nothing, which is most of a second before anything is drawn.
 * That is the trade, and it is the right way round — a cost paid once when
 * returning from a long absence, against memory held during every long
 * absence.
 */
const IDLE_MS = 30_000;

let held: Pooled | null = null;
/** Pending eviction, cancelled the moment the map is wanted again. */
let eviction: ReturnType<typeof setTimeout> | null = null;

function cancelEviction(): void {
  if (eviction === null) return;
  clearTimeout(eviction);
  eviction = null;
}

export interface Acquired {
  map: GlMap;
  container: HTMLDivElement;
  /** False when this map was just built, which is the only time it is blank. */
  reused: boolean;
  /** Whether the map has finished starting; see {@link Pooled}. */
  loaded: boolean;
  styleReady: boolean;
  drawn: boolean;
}

/**
 * Takes the map, building one only if there is none.
 *
 * `options` is read on construction and ignored on reuse, exactly as it would
 * be by the map itself — the caller applies anything that can change (the
 * style, where it is looking) afterwards, because those are the things that
 * differ between one page and the next.
 *
 * `container` is not among them and cannot be passed: the element belongs to
 * the pool and travels with the map. A caller that supplied one would be
 * describing a map it does not own.
 */
export function acquireMap(
  options: Omit<MapOptions, 'container'> & { style: string },
): Acquired {
  // Wanted again, so it is not going anywhere.
  cancelEviction();

  if (held !== null) {
    return {
      map: held.map,
      container: held.container,
      reused: true,
      loaded: held.loaded,
      styleReady: held.styleReady,
      drawn: held.drawn,
    };
  }

  const container = document.createElement('div');
  container.className = 'absolute inset-0 h-full w-full';

  const map = new GlMap({ ...options, container });
  const pooled: Pooled = {
    map,
    container,
    style: options.style,
    loaded: false,
    styleReady: false,
    drawn: false,
  };
  held = pooled;

  /*
   * Subscribed by the pool and never unsubscribed, because the pool outlives
   * every page. A borrower subscribes too, for its own state; these exist so
   * that the *next* borrower can be told what it missed.
   */
  map.on('load', () => {
    pooled.loaded = true;
  });
  map.on('style.load', () => {
    pooled.styleReady = true;
  });
  map.on('idle', () => {
    pooled.drawn = true;
  });

  return { map, container, reused: false, loaded: false, styleReady: false, drawn: false };
}

/**
 * Whether this is still the map the pool holds.
 *
 * The honest form of "is it safe to speak to". A borrowed map outlives the
 * page that borrowed it, so a page's cleanup runs against a live map and must
 * — what it put on the map is its own to take off, or the next page inherits
 * it. The one case where that is not true is the map having been discarded
 * outright, which is what this reports.
 */
export function isPooledMap(map: GlMap): boolean {
  return held !== null && held.map === map;
}

/** The style the pooled map is showing, so a caller can tell if it changed. */
export function pooledStyle(): string | null {
  return held?.style ?? null;
}

/**
 * Records a style swap in flight.
 *
 * Clears `styleReady` as well as the name, because the two are one fact: a map
 * mid-swap has no style to add layers to, and a page borrowing it in that
 * moment must be told to wait rather than inheriting the last page's answer.
 */
export function notePooledStyle(style: string): void {
  if (held === null) return;
  held.style = style;
  held.styleReady = false;
}

/**
 * Hands the map back.
 *
 * The element is detached and the map is left running. Nothing else is
 * unwound, because everything a page put *on* the map — its sources, its
 * layers, its markers — belongs to that page and is removed by its own
 * cleanup. This only takes the map off screen.
 *
 * A deadline starts here. If another page asks for the map before it expires —
 * which is what moving between map pages looks like — the borrow cancels it
 * and nothing was lost. If nobody does, the map is discarded and its memory
 * goes with it. See {@link IDLE_MS}.
 */
export function releaseMap(): void {
  if (held === null) return;
  held.container.remove();

  cancelEviction();
  eviction = setTimeout(discardPooledMap, IDLE_MS);
}

/**
 * Destroys the pooled map outright.
 *
 * Called by the idle deadline above, and by tests, where a map shared between
 * two of them would carry the first one's layers into the second.
 */
export function discardPooledMap(): void {
  cancelEviction();
  if (held === null) return;
  held.container.remove();
  held.map.remove();
  held = null;
}
