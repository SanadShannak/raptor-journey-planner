import { useEffect, useMemo, useRef } from 'react';
import { useFirstFraming, useMap } from './mapContext';
import type { GeoBounds } from '../config/geocoding';
import type { NetworkStop, StopIdentity } from '../types/stop';
import { MapCanvas } from './MapCanvas';
import type { ViewRequest } from './viewRequest';
import { StopLayer } from './StopLayer';
import { homeViewFor, STOPS_MIN_ZOOM } from './homeView';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  network: string | null;
  area: GeoBounds | null;
  /** The stop being inspected, once it is known, so the map can go to it. */
  focused: StopIdentity | null;
  /**
   * A stop is being inspected but has not arrived yet.
   *
   * Distinct from `focused === null`, which on its own says only "no stop
   * resolved" and cannot tell "the index, showing the city" apart from "a stop
   * is loading". They want opposite things from the map.
   */
  pending: boolean;
  onStopSelect: (stopId: string) => void;
  /** Narrows the markers to what the sidebar's filters have left standing. */
  filter: (stop: NetworkStop) => boolean;
  onVisibleStopsChange: (stops: NetworkStop[]) => void;
  onBelowZoomChange: (belowZoom: boolean) => void;
  /** Says the answer was a sample rather than all of it. See `StopLayer`. */
  onTruncatedChange: (truncated: boolean) => void;
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
  pending,
  onStopSelect,
  filter,
  onVisibleStopsChange,
  onBelowZoomChange,
  onTruncatedChange,
  view,
}: Props) {
  const home = useMemo(() => homeViewFor(network, area), [network, area]);
  const reduceMotion = useReducedMotion();

  return (
    <MapCanvas network={network} initialView={home}>
      <StopLayer
        onStopHover={() => {}}
        onStopSelect={onStopSelect}
        selectedStopId={focused?.id ?? null}
        filter={filter}
        /*
         * Two zoom levels further out than the journey map. Here the stops are
         * the subject rather than scenery over somebody's route, so there is
         * nothing for them to crowd — and a page about stops that opens on an
         * empty city is asking the visitor to guess that zooming would help.
         */
        minZoom={STOPS_MIN_ZOOM}
        onVisibleStopsChange={onVisibleStopsChange}
        onBelowZoomChange={onBelowZoomChange}
        onTruncatedChange={onTruncatedChange}
      />
      <RestOn
        home={home}
        focused={focused}
        pending={pending}
        view={view}
        animate={!reduceMotion}
      />
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
 *    belongs — but only once nothing is on its way. A stop that has been asked
 *    for and not yet answered holds the map still rather than sending it home
 *    and back.
 *
 * Split across two effects this went wrong in a way worth recording: a "go
 * here" that stuck around made every later stop unframable, because the branch
 * that framed a stop was behind an early return for a request that never
 * cleared. The precedence is a single list for that reason.
 *
 * Imperative because the map reads its `center` and `zoom` once, at
 * construction, and neither the network nor the stop is known by then. The
 * animation is gated on `prefers-reduced-motion`: the map eases this in
 * JavaScript, where no media query can reach it.
 */
function RestOn({
  home,
  focused,
  pending,
  view,
  animate,
}: {
  home: { center: [number, number]; zoom: number };
  focused: StopIdentity | null;
  pending: boolean;
  view: ViewRequest;
  animate: boolean;
}) {
  const map = useMap();
  const isFirstFraming = useFirstFraming();
  /*
   * The last request actually acted on.
   *
   * Initialised to the one this component mounted with, so that request counts
   * as already served: what places the map on the way in is the opening frame
   * below, not a press nobody made. After that only a *change* of id is a
   * press, which is what `askFor` exists to produce.
   */
  const served = useRef(view.id);

  useEffect(() => {
    // The opening frame is where the map should already have been, so it is
    // placed rather than travelled to. See `useFirstFraming`.
    const first = isFirstFraming();
    const moving = animate && !first;

    /*
     * Closer than the resting view, and never further out than it: arriving at
     * a stop from a link should show its own street, while pressing one
     * already on screen should not yank the map backwards.
     */
    if (focused !== null) {
      map.easeTo({
        center: [focused.lon, focused.lat],
        zoom: Math.max(map.getZoom(), 17),
        animate: moving,
      });
      return;
    }

    /*
     * A stop is on its way. Stay exactly where we are until it arrives.
     *
     * Falling through from here sent the map home, because "no stop resolved"
     * and "no stop wanted" were the same condition. Pressing a stop on the map
     * therefore zoomed out to the city and then back in to a stop a few metres
     * from the last one — and the two animated moves collided, so what a
     * reader actually saw was the zoom out, and no zoom back in.
     */
    if (pending) return;

    /*
     * A press — "near me", or "city centre" — and only once per press.
     *
     * This effect re-runs for reasons that are not requests at all: closing a
     * stop, the network arriving. Acting on the standing `view` each time is
     * what made the map jump back to the city the moment a stop was closed,
     * undoing whatever the reader had zoomed to. A request is a *change* of
     * id, which is precisely what `askFor` produces.
     */
    if (view.id !== served.current) {
      served.current = view.id;

      if (view.kind === 'at') {
        map.easeTo({
          center: [view.lon, view.lat],
          zoom: Math.max(map.getZoom(), 16),
          animate: moving,
        });
        return;
      }

      map.easeTo({
        center: [home.center[1], home.center[0]],
        zoom: home.zoom,
        animate: moving,
      });
      return;
    }

    /*
     * Nothing has been asked for, so the only framing left is the opening one.
     * Every later run leaves the map exactly where it is.
     *
     * `home` is a dependency, and has to be: it is not known at mount. The
     * network arrives from `/api/network` a moment later, and until it does
     * this is resting on the fallback city — so a map that refused to re-frame
     * would open on Helsinki for every other network and never correct itself.
     */
    if (!first) return;

    map.easeTo({
      center: [home.center[1], home.center[0]],
      zoom: home.zoom,
      animate: moving,
    });
  }, [map, focused, pending, view, home, animate, isFirstFraming]);

  return null;
}
