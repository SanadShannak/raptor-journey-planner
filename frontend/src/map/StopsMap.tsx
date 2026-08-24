import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import type { GeoBounds } from '../config/geocoding';
import type { NetworkStop, StopIdentity } from '../types/stop';
import { MapCanvas } from './MapCanvas';
import type { ViewRequest } from './viewRequest';
import { StopLayer } from './StopLayer';
import { stopsViewFor } from './homeView';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  network: string | null;
  area: GeoBounds | null;
  /** The stop being inspected, once it is known, so the map can go to it. */
  focused: StopIdentity | null;
  onStopSelect: (stopId: string) => void;
  /** Narrows the markers to what the sidebar's filters have left standing. */
  filter: (stop: NetworkStop) => boolean;
  onVisibleStopsChange: (stops: NetworkStop[]) => void;
  onBelowZoomChange: (belowZoom: boolean) => void;
  /** Where the visitor last asked to be taken. */
  view: ViewRequest;
}
/**
 * The network's stops, as a place to browse rather than a backdrop.
 *
 * The same ground as the journey map — {@link MapCanvas} — carrying only the
 * stop layer. It opens close enough in that stops are already drawn, because a
 * page about stops that opens on an empty city is asking the visitor to guess
 * that zooming would help.
 *
 * It is never the only way to reach a stop. Everything drawn here is listed
 * beside it as ordinary buttons, which is what keeps the markers out of the tab
 * order without putting anything out of reach.
 */
export function StopsMap({
  network,
  area,
  focused,
  onStopSelect,
  filter,
  onVisibleStopsChange,
  onBelowZoomChange,
  view,
}: Props) {
  const home = useMemo(() => stopsViewFor(network, area), [network, area]);
  const reduceMotion = useReducedMotion();

  return (
    <MapCanvas network={network}>
      <StopLayer
        onStopHover={() => {}}
        onStopSelect={onStopSelect}
        selectedStopId={focused?.id ?? null}
        filter={filter}
        onVisibleStopsChange={onVisibleStopsChange}
        onBelowZoomChange={onBelowZoomChange}
      />
      <RestOn home={home} focused={focused} view={view} animate={!reduceMotion} />
    </MapCanvas>
  );
}

/**
 * Where the map looks.
 *
 * One effect with one order of precedence, rather than several racing to move
 * the same map:
 *
 * 1. **The stop being inspected.** It is in the URL, so it is the least
 *    ambiguous thing on the page — arriving at `/stops/:id` from anywhere must
 *    put that stop in the middle of its own street.
 * 2. **The last thing the visitor asked for** — their own position, or the
 *    city. An explicit press outranks the resting view.
 * 3. **The city**, which is where a stops page with no other instruction
 *    belongs.
 *
 * Split across two effects this went wrong in a way worth recording: a "go
 * here" that stuck around made every later stop unframable, because the branch
 * that framed a stop was behind an early return for a request that never
 * cleared. The precedence is a single list for that reason.
 *
 * Imperative because `MapContainer` freezes its own `center` and `zoom` at
 * mount, and neither the network nor the stop is known by then. The animation
 * is gated on `prefers-reduced-motion`: Leaflet eases this in JavaScript, where
 * no media query can reach it.
 */
function RestOn({
  home,
  focused,
  view,
  animate,
}: {
  home: { center: [number, number]; zoom: number };
  focused: StopIdentity | null;
  view: ViewRequest;
  animate: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    /*
     * Closer than the resting view, and never further out than it: arriving at
     * a stop from a link should show its own street, while pressing one
     * already on screen should not yank the map backwards.
     */
    if (focused !== null) {
      map.setView([focused.lat, focused.lon], Math.max(map.getZoom(), 17), { animate });
      return;
    }

    if (view.kind === 'at') {
      map.setView([view.lat, view.lon], Math.max(map.getZoom(), 16), { animate });
      return;
    }

    /*
     * `home` is a dependency, and has to be: it is not known at mount. The
     * network arrives from `/api/network` a moment later, and until it does
     * this is resting on the fallback city — so a map that refused to re-frame
     * would open on Helsinki for every other network and never correct itself.
     *
     * Safe to depend on because it changes exactly once: it is memoised on the
     * network and its area, both set once and never again.
     */
    map.setView(home.center, home.zoom, { animate });
  }, [map, focused, view, home, animate]);

  return null;
}
