import { useEffect, type ReactNode } from 'react';
import {
  AttributionControl,
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import { useLocale } from '../i18n';
import { useTheme } from '../theme';
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
 * Tiles in the right cartography for the colour scheme, zoom and attribution
 * controls placed on the side the document reads from, and the two fixes
 * Leaflet needs to behave inside a React layout. There are two maps now — a
 * journey and a network of stops — and none of that differs between them; kept
 * in each it would be two copies free to drift the first time one is adjusted.
 *
 * One Leaflet fact shapes everything here: **`MapContainer` freezes its props
 * at mount.** `center`, `zoom` and every map option are read once and never
 * again, so nothing that arrives later — the network's identity, a journey, a
 * stop to frame — can be passed as a prop. Framing is always done imperatively
 * from a child holding the map instance.
 */

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

  const tiles = tileSourceFor(network);
  const rtl = direction === 'rtl';

  return (
    <MapContainer
      className="absolute inset-0 h-full w-full"
      center={FIRST_VIEW.center}
      zoom={FIRST_VIEW.zoom}
      zoomControl={false}
      attributionControl={false}
      /*
       * Every one of these is a movement Leaflet runs in JavaScript, which no
       * media query can shorten. `inertia` is the glide that continues after
       * you let go, and is the one most easily forgotten.
       */
      zoomAnimation={!reduceMotion}
      fadeAnimation={!reduceMotion}
      markerZoomAnimation={!reduceMotion}
      inertia={!reduceMotion}
    >
      <TileLayer
        // Two real cartographies rather than one filtered one, so the colours
        // drawn on top are never distorted.
        url={resolved === 'dark' ? tiles.dark : tiles.light}
        attribution={tiles.attribution}
        maxZoom={tiles.maxZoom}
        detectRetina
      />

      <ZoomControl position={rtl ? 'topright' : 'topleft'} />
      <AttributionControl position={rtl ? 'bottomleft' : 'bottomright'} prefix={false} />
      <ZoomButtonLabels
        zoomIn={t(strings.planner.zoomIn)}
        zoomOut={t(strings.planner.zoomOut)}
      />
      <KeepSized />

      {children}
    </MapContainer>
  );
}

/**
 * Frames the map on a view it should rest at.
 *
 * `fitBounds` throws on an invalid box, and anything that collapses to a single
 * point produces a valid but zero-sized one — which Leaflet answers by slamming
 * to its maximum zoom. Hence both the null guard and the `maxZoom`.
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
      map.setView(home.center, home.zoom, { animate });
      return;
    }

    map.fitBounds(box, { padding: [32, 32], maxZoom: 16, animate });
  }, [map, box, home, animate]);

  return null;
}

/**
 * Tells the map when its own box changed size.
 *
 * Leaflet's `trackResize` watches the window, not the element. That covers most
 * of what happens — the sidebar is a fixed width, so every change to the map's
 * size is also a window resize — but it does not cover the first frame, where a
 * map created before layout settles renders as a grey half-panel. The observer
 * fires once on `observe()`, which fixes exactly that.
 */
function KeepSized() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false, debounceMoveend: true });
      });
    });

    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

/**
 * The zoom buttons' names.
 *
 * Leaflet writes these as `title` and `aria-label`, and its own defaults are
 * English. They are set from outside because the control reads them once, when
 * it is created — the same freezing that applies to the map itself.
 */
function ZoomButtonLabels({ zoomIn, zoomOut }: { zoomIn: string; zoomOut: string }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const label = (selector: string, text: string) => {
      const button = container.querySelector(selector);
      if (button === null) return;
      button.setAttribute('title', text);
      button.setAttribute('aria-label', text);
    };
    label('.leaflet-control-zoom-in', zoomIn);
    label('.leaflet-control-zoom-out', zoomOut);
  }, [map, zoomIn, zoomOut]);

  return null;
}
