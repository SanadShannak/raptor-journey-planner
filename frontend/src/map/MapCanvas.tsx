import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AttributionControl,
  config as glConfig,
  Map as GlMap,
  NavigationControl,
} from 'maplibre-gl';
/*
 * The renderer's worker, asked for as a URL so the bundler emits it.
 *
 * MapLibre finds its own worker with `new URL('./maplibre-gl-worker.mjs',
 * import.meta.url)`, choosing the filename at run time between its dev and
 * production builds. A bundler cannot follow a path it only learns about while
 * running, so nothing was emitted and the built app resolved the worker to a
 * file beside the chunk that did not exist.
 *
 * That failure is silent in the worst way: the map constructs, sizes itself
 * and paints its background, then waits forever for a worker that 404s. No
 * exception, no failed style — just an empty canvas that looks like a CSS
 * problem.
 *
 * `?worker&url` and not `?url`. The plain form copies the one file verbatim,
 * and that file imports a shared chunk of its own which is then missing — the
 * same blank map, one step further along. The worker form bundles the entry
 * with its dependencies and hands back the URL of the result.
 */
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useLocale } from '../i18n';
import { useTheme } from '../theme';
import {
  MapContext,
  useFirstFraming,
  useMap,
  type MapHandle,
} from './mapContext';
import { lngLatBounds } from './coords';
import {
  acquireMap,
  isPooledMap,
  notePooledStyle,
  pooledStyle,
  releaseMap,
} from './mapPool';
import { homeViewFor, type HomeView } from './homeView';
import { tileSourceFor } from './tileSource';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  /** Which network, for the tile source. */
  network: string | null;
  /**
   * Where the map opens, before anything has been framed on it.
   *
   * Passed by the page rather than fixed here, because the right answer is a
   * property of what the map is *for*: a page about stops opens close enough
   * in that stops are drawn, and a page about a journey opens on the city it
   * is about to draw one across.
   *
   * Without it every map opened at one shared default and then moved to where
   * it actually belonged, which is a zoom the reader watches happen on the way
   * to every page. The first framing is instant for the same reason — see
   * {@link useFirstFraming}.
   */
  initialView?: HomeView | undefined;
  /** What the map draws on top: layers, markers, controls of its own. */
  children: ReactNode;
}

/**
 * The ground every map in this app is drawn on.
 *
 * A vector basemap in the right cartography for the colour scheme, zoom and
 * attribution controls placed on the side the document reads from, and the
 * sizing fix a GL canvas needs inside a React layout. There are three maps now
 * — a journey, a line, and a network of stops — and none of that differs
 * between them; kept in each it would be three copies free to drift the first
 * time one is adjusted.
 *
 * Two facts about a GL map shape everything here, and both are new since this
 * was Leaflet.
 *
 * **The map is created once and never re-created.** Its options are read at
 * construction, so nothing that arrives later — the network's identity, a
 * journey, a stop to frame — can be passed as a prop. Framing is always done
 * imperatively from a child holding the map instance, exactly as before.
 *
 * **Changing the style empties the map.** Sources and layers belong to the
 * style document, so swapping Positron for Dark Matter discards everything
 * drawn on top of it. Children are not left to discover that: the style load
 * is counted, the count is handed down, and a child that owns a source lists
 * it as an effect dependency. See `mapContext.ts`.
 *
 * Children render only once the map exists. A GL map is not usable between
 * `new Map()` and its `load` event, and a child that tried would be adding
 * layers to a style that has not arrived.
 */

glConfig.WORKER_URL = workerUrl;

/*
 * The frame at mount, before `/api/network` has said which city this is.
 *
 * Taken from the same table the real resting view comes from, so the first
 * frame and the second are not two different places.
 */
const FIRST_VIEW = homeViewFor(null, null);

export function MapCanvas({ network, initialView, children }: Props) {
  const { direction, strings, t } = useLocale();
  const { resolved } = useTheme();
  const reduceMotion = useReducedMotion();

  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<GlMap | null>(null);
  /** Counts style loads. See {@link MapHandle}. */
  const [styleEpoch, setStyleEpoch] = useState(0);
  /** False only while a style swap is in flight. See {@link MapHandle}. */
  const [styleReady, setStyleReady] = useState(false);
  /**
   * Whether the map has finished drawing something worth looking at.
   *
   * A GL map paints its background the moment it exists and its cartography
   * only once tiles have arrived and been drawn, so there is a real stretch
   * where the page shows an empty panel and then the map appears in it all at
   * once. Fading that in turns a pop into an arrival — the panel is still
   * there for exactly as long, but it resolves rather than switches.
   *
   * `idle` and not `load`: `load` fires when the *style* is ready, which is
   * before any tile has been drawn, and fading in on it just moves the pop a
   * few hundred milliseconds later.
   */
  const [painted, setPainted] = useState(false);
  /**
   * The borrowed map, and whether it is still there to be spoken to.
   *
   * Asked of the pool rather than tracked with a flag of our own, because the
   * pool is what knows. A page handing the map back does not end it — the next
   * page will borrow the same one — so cleanups here and in every layer run
   * against a live map and must, or what this page drew stays drawn. See
   * {@link MapHandle} for the ordering that makes this worth being careful
   * about.
   */
  const borrowed = useRef<GlMap | null>(null);
  const isAlive = useCallback(
    () => borrowed.current !== null && isPooledMap(borrowed.current),
    [],
  );

  /*
   * Read once, at construction, and deliberately not a dependency: a map's
   * opening view is a fact about the moment it is created, and re-reading it
   * later would fight whatever the page has framed since.
   */
  const opening = useRef(initialView ?? FIRST_VIEW);

  /** See {@link MapHandle} — one answer shared by every framing component. */
  const framed = useRef(false);
  const isFirstFraming = useCallback(() => {
    const first = !framed.current;
    framed.current = true;
    return first;
  }, []);

  const tiles = tileSourceFor(network);
  const style = resolved === 'dark' ? tiles.dark : tiles.light;
  const rtl = direction === 'rtl';

  /**
   * The style the map is already showing.
   *
   * Kept so the effect below can tell "the scheme changed" from "React ran an
   * effect again" — see there for why re-applying the same style is not free.
   */
  const applied = useRef(style);

  /*
   * The controls' own words. MapLibre writes these into `title` and
   * `aria-label`, and its defaults are English — handed over at construction
   * because the map reads them once.
   *
   * Held in a ref so the map is not re-created when the locale changes; the
   * effect below re-adds the controls instead, which is the cheap half.
   */
  const labels = useRef({ zoomIn: '', zoomOut: '' });
  labels.current = {
    zoomIn: t(strings.planner.zoomIn),
    zoomOut: t(strings.planner.zoomOut),
  };

  /*
   * Borrowed on the way in, handed back on the way out.
   *
   * The map is not built here and not destroyed here — see `mapPool`. Building
   * one per page meant every navigation threw away a style document, a worker
   * pool and every parsed tile, and spent about a second earning them back
   * before anything was drawn.
   *
   * What is still per-page is everything that differs between pages: where the
   * map is looking, and which scheme it is in. Both are applied below rather
   * than passed as construction options, because on reuse there is nothing to
   * construct.
   */
  useEffect(() => {
    const node = container.current;
    if (node === null) return;

    const {
      map: instance,
      container: host,
      reused,
      loaded,
      styleReady: readyNow,
      drawn,
    } = acquireMap({
      style,
      center: [opening.current.center[1], opening.current.center[0]],
      zoom: opening.current.zoom,
      maxZoom: tiles.maxZoom,
      attributionControl: false,
      /*
       * Neither is offered, and that is a decision rather than an omission.
       * The map is an enhancement over an itinerary written out beside it, and
       * a rotated or tilted transit map is harder to read against that list —
       * north-up is the orientation every printed network map uses. It also
       * removes a gesture that has no keyboard equivalent.
       */
      pitchWithRotate: false,
      dragRotate: false,
      /*
       * The glide that continues after a drag. Leaflet called it inertia and it
       * was the movement most easily forgotten when honouring the motion
       * preference; MapLibre spells it as a drag-pan option.
       */
      dragPan: reduceMotion ? { linearity: 1, deceleration: Infinity } : true,
      /*
       * MapLibre reads `prefers-reduced-motion` itself for its own eased
       * movements, but only for those it starts; every `easeTo` this app calls
       * passes its own `animate`, which is what actually governs framing.
       */
      locale: {
        'NavigationControl.ZoomIn': labels.current.zoomIn,
        'NavigationControl.ZoomOut': labels.current.zoomOut,
      },
    });

    // The element travels with the map; a GL map cannot be handed a different
    // one. See `mapPool`.
    node.appendChild(host);
    borrowed.current = instance;

    applied.current = pooledStyle() ?? style;

    const onLoad = () => setMap(instance);
    const onIdle = () => setPainted(true);
    /*
     * Fired on the first style and on every one after it. `styleEpoch` counts
     * them, which is how a child knows its layers were discarded and it is
     * time to add them again.
     */
    const onStyle = () => {
      setStyleReady(true);
      setStyleEpoch((count) => count + 1);
    };

    instance.on('load', onLoad);
    instance.on('style.load', onStyle);
    instance.once('idle', onIdle);

    if (reused) {
      /*
       * The borrowed map is somewhere else: the page before this one framed
       * it. Put it where this page opens, without animating — the same rule a
       * freshly built map follows for its own first framing.
       */
      instance.jumpTo({
        center: [opening.current.center[1], opening.current.center[0]],
        zoom: opening.current.zoom,
      });
      instance.resize();

      /*
       * Whatever already happened will not happen again, so it is applied
       * here; whatever has not yet happened still arrives as an event.
       *
       * Each is asked separately rather than inferred from "reused", which was
       * the bug: a map borrowed moments after it was built has not loaded, and
       * telling the layers otherwise threw `Style is not done loading` — in a
       * passive effect, which takes the render down with it.
       */
      if (loaded) setMap(instance);
      if (readyNow) setStyleReady(true);
      if (drawn) setPainted(true);
    }

    return () => {
      /*
       * The map is handed back, not ended. Every cleanup after this one — the
       * controls below, and every layer and marker a child drew — runs against
       * a map that is still alive, and must: what this page put on the map is
       * this page's to take off again, or the next one inherits it.
       */
      instance.off('load', onLoad);
      instance.off('style.load', onStyle);
      instance.off('idle', onIdle);
      setMap(null);
      /*
       * `borrowed` is deliberately left pointing at the map.
       *
       * It is what `isAlive` reads, and every cleanup that asks runs *after*
       * this one — clearing it here answered "no" to all of them, so each
       * layer skipped its own removal and the next page found the sources
       * still there: `Source "route-stops" already exists`, thrown in an
       * effect, which takes the page down with it.
       *
       * The honest answer during this teardown is yes: the map is alive, it is
       * simply going back to the pool, and what this page drew is this page's
       * to remove.
       */
      releaseMap();
    };
    // Borrowed once: the style, the labels and the motion preference are all
    // applied by the effects below rather than by taking a different map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * The scheme changed, or the network did. Restyle rather than rebuild.
   *
   * Guarded on the style having actually changed, and that guard is doing real
   * work rather than saving a no-op call. The map is *constructed* with a
   * style, so without this the first run of this effect re-applied the one it
   * already had — and `setStyle` is not idempotent: it discards the whole
   * style document and every source and layer on it, then loads it all again.
   * Every map therefore threw its overlays away once at startup and rebuilt
   * them, which is how the drawn route came and went depending on where the
   * data happened to arrive in that sequence.
   */
  useEffect(() => {
    if (map === null) return;
    if (applied.current === style) return;

    applied.current = style;
    notePooledStyle(style);
    // Says "do not add anything yet" until the new style has loaded; the flag
    // is what brings the overlays back afterwards rather than losing them.
    setStyleReady(false);
    map.setStyle(style);
  }, [map, style]);

  /*
   * The controls, and the side they sit on.
   *
   * Re-added when the reading direction or the wording changes, because both
   * are read when a control is created. Removing and adding two small controls
   * is cheaper than the alternative, which is reaching into their DOM.
   */
  useEffect(() => {
    if (map === null) return;

    const zoom = new NavigationControl({
      showCompass: false,
      showZoom: true,
    });
    /*
     * No `customAttribution`. A GL style document carries the credit for its
     * own sources, and the control renders it — so adding ours printed the
     * same two names twice, once from each. The raster map needed it supplied
     * because a tile URL carries nothing but pixels.
     *
     * `TileSource.attribution` is kept as the fallback for a source that says
     * nothing about itself; today's does, and this asks the style first.
     */
    const attribution = new AttributionControl({ compact: false });

    map.addControl(zoom, rtl ? 'top-right' : 'top-left');
    map.addControl(attribution, rtl ? 'bottom-left' : 'bottom-right');

    return () => {
      // A destroyed map has already taken its controls with it, and asking it
      // to remove them again throws. See `MapHandle`.
      if (!isAlive()) return;
      map.removeControl(zoom);
      map.removeControl(attribution);
    };
  }, [map, rtl, styleEpoch, isAlive]);

  /*
   * Tells the map when its own box changed size.
   *
   * MapLibre watches the window, not the element. That covers most of what
   * happens — the sidebar is a fixed width, so every change to the map's size
   * is also a window resize — but it does not cover the first frame, where a
   * map created before layout settles renders as a sliver. The observer fires
   * once on `observe()`, which fixes exactly that.
   */
  useEffect(() => {
    if (map === null) return;
    if (typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.resize());
    });

    observer.observe(map.getContainer());
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

  const handle = useMemo<MapHandle | null>(
    () =>
      map === null
        ? null
        : { map, styleEpoch, styleReady, isAlive, isFirstFraming },
    [map, styleEpoch, styleReady, isAlive, isFirstFraming],
  );

  return (
    /*
      `data-painted` drives the fade; the rule lives in the stylesheet because
      it has to reach inside MapLibre's own elements, which this component
      never renders. The controls sit in a container of their own and are not
      held back — they are the map's furniture rather than its content.
    */
    <div
      ref={container}
      data-painted={painted ? 'true' : 'false'}
      className="absolute inset-0 h-full w-full"
    >
      {handle !== null && (
        <MapContext.Provider value={handle}>{children}</MapContext.Provider>
      )}
    </div>
  );
}

/**
 * Frames the map on a view it should rest at.
 *
 * `fitBounds` on a box that collapses to a single point produces a valid but
 * zero-sized one, which a GL map answers by going to its maximum zoom — hence
 * both the null guard and the `maxZoom`.
 *
 * **Home is where the map opens, not somewhere it returns to.** Having nothing
 * to frame is not a request to go anywhere: closing a line and coming back to
 * the index used to throw away whatever the reader had zoomed to and drop them
 * back on the city, which is the map undoing their work for them. The only
 * time an empty box means "go home" is the opening frame, when the map has not
 * been anywhere else yet.
 */
export function FitTo({
  box,
  home,
  animate,
}: {
  box: [[number, number], [number, number]] | null;
  home: HomeView;
  animate: boolean;
}) {
  const map = useMap();
  const isFirstFraming = useFirstFraming();

  useEffect(() => {
    // The opening frame is where the map should already have been, so it is
    // placed rather than travelled to. See `useFirstFraming`.
    const first = isFirstFraming();
    const moving = animate && !first;

    if (box === null) {
      // Nothing to frame. Only the opening frame reads that as "go home"; any
      // later one leaves the map wherever the reader has taken it.
      if (!first) return;
      map.easeTo({
        center: [home.center[1], home.center[0]],
        zoom: home.zoom,
        animate: moving,
      });
      return;
    }

    map.fitBounds(lngLatBounds(box), { padding: 32, maxZoom: 16, animate: moving });
  }, [map, box, home, animate, isFirstFraming]);

  return null;
}
