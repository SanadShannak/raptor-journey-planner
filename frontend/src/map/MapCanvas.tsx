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
import { MapContext, useMap, type MapHandle } from './mapContext';
import { lngLatBounds } from './coords';
import { homeViewFor, type HomeView } from './homeView';
import { tileSourceFor } from './tileSource';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  /** Which network, for the tile source. */
  network: string | null;
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

export function MapCanvas({ network, children }: Props) {
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
   * Cleared the moment the map is destroyed, and read by every cleanup that
   * would otherwise talk to it afterwards — including the ones in this file.
   * See {@link MapHandle} for why that ordering bites.
   */
  const alive = useRef(true);
  const isAlive = useCallback(() => alive.current, []);

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

  /* Created once, for the life of the component. */
  useEffect(() => {
    const node = container.current;
    if (node === null) return;

    // Set here rather than only at declaration: StrictMode mounts, tears down,
    // and mounts again, and the second map must not inherit the first's death.
    alive.current = true;

    const instance = new GlMap({
      container: node,
      style,
      center: [FIRST_VIEW.center[1], FIRST_VIEW.center[0]],
      zoom: FIRST_VIEW.zoom,
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

    applied.current = style;
    const onLoad = () => setMap(instance);
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

    return () => {
      /*
       * Announced before it happens. Every other cleanup — the controls below,
       * and every child drawn on this map — runs *after* this one and would
       * otherwise reach for a map with no internals left.
       */
      alive.current = false;
      instance.off('load', onLoad);
      instance.off('style.load', onStyle);
      setMap(null);
      instance.remove();
    };
    // Built once: the style, the labels and the motion preference are all
    // applied by the effects below rather than by rebuilding the map.
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
      map === null ? null : { map, styleEpoch, styleReady, isAlive },
    [map, styleEpoch, styleReady, isAlive],
  );

  return (
    <div ref={container} className="absolute inset-0 h-full w-full">
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

  useEffect(() => {
    if (box === null) {
      map.easeTo({
        center: [home.center[1], home.center[0]],
        zoom: home.zoom,
        animate,
      });
      return;
    }

    map.fitBounds(lngLatBounds(box), { padding: 32, maxZoom: 16, animate });
  }, [map, box, home, animate]);

  return null;
}
