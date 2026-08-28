import { useEffect, useMemo, useRef, useState } from 'react';
import type { LngLatBounds } from 'maplibre-gl';
import { getStopsInBounds } from '../api/stops';
import type { GeoBounds } from '../config/geocoding';
import type { NetworkStop } from '../types/stop';
import { familyFor, visualForFamily } from '../features/journey/modeVisuals';
import { modeIconMarkup } from '../features/journey/modeIconMarkup';
import { useMap, useMapEvent } from './mapContext';
import { MapMarker } from './MapMarker';

/**
 * The network's own stops, for the part of it you are looking at.
 *
 * A feed has thousands of these and a screen has room for tens, so the question
 * is never "which stops exist" but "which stops are here" — and it is only
 * worth asking once the map is close enough that the answer is a handful. Below
 * that zoom the layer draws nothing and asks nothing: a city's worth of markers
 * is not a map, it is a texture, and it would cost a request per pan to produce
 * it.
 *
 * The mode is the marker. A stop shows the silhouette of what calls there, in
 * that mode's colour, which is the same pairing the itinerary and the strip map
 * use. A stop nothing serves — a real thing in a feed, where a stop outlives its
 * routes — gets a plain marker rather than a guessed one: a bus icon on a tram
 * stop sends someone to the wrong side of the street.
 *
 * Drawn as HTML markers rather than as a symbol layer, deliberately. A symbol
 * layer would let the basemap's own labels negotiate with these for space,
 * which sounds like the point of moving to vector — but the markers carry
 * Tailwind classes and a hover state, and reproducing those as GL paint
 * properties would mean a second copy of the palette that could drift from the
 * first. The lines below *are* a GL layer, which is where the collision
 * actually earns its keep: a street name now steps aside for a route.
 */

/**
 * Below this the answer is a texture rather than a map.
 *
 * Neighbourhood level, and the default because it suits the journey map: far
 * enough out to be useful while looking at a journey rather than only while
 * looking at a corner, and close enough in that the thinning below has room to
 * leave most of them standing. Further out they read as a pattern rather than
 * as places, and they crowd the journey, which is what that map is for.
 *
 * A map whose subject *is* the stops wants them sooner, and passes its own —
 * see the `minZoom` prop. It can afford to: nothing else is competing for the
 * ground there.
 */
const DEFAULT_MIN_ZOOM = 15;

/**
 * How close two stops may be drawn before one of them is left out.
 *
 * A city centre puts stops within a few metres of each other — the two
 * directions of one street, four corners of one junction — and at any zoom
 * that shows a neighbourhood those land on top of one another. Thinning them
 * in screen space keeps the survivors legible, and the ones left out come back
 * as you go in, which is the same bargain the leg badges make.
 *
 * Interchanges win the ties: a stop several modes call at is the one most
 * worth seeing, and the one most likely to be what somebody is looking for.
 */
const MIN_GAP = 22;

/** How long the map must sit still before it is worth asking again. */
const SETTLE_MS = 250;

/**
 * Asked for slightly more than is visible, so a small pan is already answered.
 *
 * A fifth of the viewport in each direction — enough to cover the nudges that
 * make up most panning, and not so much that the cap is spent on stops nobody
 * is looking at.
 */
const OVERSCAN = 0.2;

function padded(bounds: LngLatBounds): GeoBounds {
  const latPad = (bounds.getNorth() - bounds.getSouth()) * OVERSCAN;
  const lonPad = (bounds.getEast() - bounds.getWest()) * OVERSCAN;

  return {
    minLat: bounds.getSouth() - latPad,
    minLon: bounds.getWest() - lonPad,
    maxLat: bounds.getNorth() + latPad,
    maxLon: bounds.getEast() + lonPad,
  };
}

const covers = (outer: GeoBounds, inner: LngLatBounds): boolean =>
  outer.minLat <= inner.getSouth() &&
  outer.minLon <= inner.getWest() &&
  outer.maxLat >= inner.getNorth() &&
  outer.maxLon >= inner.getEast();

interface Props {
  /** Fires on hover, so whatever else is floating over the map can withdraw. */
  onStopHover: () => void;
  /** Opens a stop. Absent where there is nothing yet to open one into. */
  onStopSelect?: ((stopId: string) => void) | undefined;
  /** The stop already open, drawn as the chosen one rather than as scenery. */
  selectedStopId?: string | null | undefined;
  /**
   * Narrows what is drawn, without narrowing what is reported.
   *
   * The two are deliberately different. A list beside the map needs the whole
   * set in order to offer a mode filter at all — filtering the report as well
   * would mean choosing "tram" removed "bus" from the choices — so the filter
   * applies to the markers and the unfiltered set still goes up.
   */
  filter?: ((stop: NetworkStop) => boolean) | undefined;
  /**
   * The stops **in view**, handed up so a list beside the map can show them —
   * which is what makes this layer reachable without a pointer, and is why the
   * markers can stay out of the tab order.
   *
   * Unfiltered and unthinned: thinning is about pixels — two markers on one
   * corner — and a list has no such problem, so it should not inherit those
   * losses, and narrowing by mode would leave the filter unable to offer the
   * modes it had just removed.
   *
   * In view, though, is meant literally. What is *fetched* is deliberately
   * more than that — a fifth past each edge, so a small pan asks nothing — and
   * a move that stays inside what is already held asks nothing either. Sending
   * the whole held set up meant the list answered for an area much larger than
   * the map was showing: zoom into a street and the map went empty while the
   * page beside it still claimed seventy-nine stops were in view, and listed
   * them.
   */
  onVisibleStopsChange?: ((stops: NetworkStop[]) => void) | undefined;
  /** Says the map is pulled out too far to draw any, which is not "none". */
  onBelowZoomChange?: ((belowZoom: boolean) => void) | undefined;
  /**
   * How far out this map still draws stops.
   *
   * A property of what the map is *for* rather than of the layer: over a
   * journey they are scenery and should not crowd it, and on a page about
   * stops they are the subject and should appear as early as they can be told
   * apart.
   */
  minZoom?: number | undefined;
}

export function StopLayer({
  onStopHover,
  onStopSelect,
  selectedStopId = null,
  filter,
  onVisibleStopsChange,
  onBelowZoomChange,
  minZoom = DEFAULT_MIN_ZOOM,
}: Props) {
  const map = useMap();
  const [stops, setStops] = useState<NetworkStop[]>([]);
  /** Bumped whenever the map settles, which is when the projection moved. */
  const [settled, setSettled] = useState(0);
  /** The stop under the pointer, if any. */
  const [hovered, setHovered] = useState<NetworkStop | null>(null);
  /** The area the current answer covers, so a small pan asks nothing. */
  const covered = useRef<GeoBounds | null>(null);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);

  /*
   * The two callbacks that report upward are held in refs rather than read
   * from the closure. They set the host's state, so a host that re-renders in
   * response would hand down a new function, and reading it as a dependency
   * would re-run the effect that called it — which is a loop, not a render.
   */
  const belowZoom = useRef(onBelowZoomChange);
  belowZoom.current = onBelowZoomChange;
  const visibleChanged = useRef(onVisibleStopsChange);
  visibleChanged.current = onVisibleStopsChange;

  const refresh = () => {
    window.clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      if (map.getZoom() < minZoom) {
        request.current?.abort();
        covered.current = null;
        // "Too far out to draw any" is not "there are none here", and a list
        // beside the map has to say the right one of those.
        belowZoom.current?.(true);
        setStops((current) => (current.length === 0 ? current : []));
        return;
      }

      belowZoom.current?.(false);

      const visible = map.getBounds();
      if (covered.current !== null && covers(covered.current, visible)) return;

      const wanted = padded(visible);
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;

      void getStopsInBounds(wanted, { signal: controller.signal })
        .then((answer) => {
          if (controller.signal.aborted) return;
          /*
           * A truncated answer is not the whole area, so it is not recorded as
           * covering it — otherwise panning inside a dense centre would keep
           * showing the same four hundred stops and never ask for the rest.
           */
          covered.current = answer.truncated ? null : wanted;
          setStops(answer.stops);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // Stops are an extra. Failing to fetch them must not disturb the
          // journey the map is drawing.
          covered.current = null;
          setStops([]);
        });
    }, SETTLE_MS);
  };

  const onSettle = () => {
    setSettled((count) => count + 1);
    refresh();
  };

  useMapEvent('moveend', onSettle);
  useMapEvent('zoomend', onSettle);
  // The name is placed from a projection, so it belongs to a still map.
  useMapEvent('movestart', () => setHovered(null));
  useMapEvent('zoomstart', () => setHovered(null));

  useEffect(() => {
    refresh();
    return () => {
      window.clearTimeout(timer.current);
      request.current?.abort();
    };
    // Runs once: everything after the first look is driven by map events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  /*
   * Thinned in screen space at the zoom being looked at, so a dense centre
   * shows what it can rather than a pile. Recomputed when the map moves,
   * because that is when the projection changes.
   */
  const drawn = useMemo(() => {
    // Not read: it is the signal that every projection below has moved, which
    // is exactly when this has to be worked out again.
    void settled;

    const placed: { x: number; y: number }[] = [];
    const keep: NetworkStop[] = [];

    /*
     * Order decides who survives a crowded corner, so the stop being inspected
     * goes first — it is the one thing on this map somebody has actually asked
     * about, and it must not be thinned away in favour of a neighbour.
     *
     * Without it a pair like Vuosaari's two platforms, three metres apart and
     * therefore the same pixel at any readable zoom, resolved the tie by id
     * forever: one of them was drawn and the other could not be seen at all
     * until the map was zoomed to the point of absurdity.
     */
    const byImportance = [...(filter === undefined ? stops : stops.filter(filter))].sort(
      (a, b) =>
        Number(b.id === selectedStopId) - Number(a.id === selectedStopId) ||
        b.modes.length - a.modes.length ||
        a.id.localeCompare(b.id),
    );

    for (const stop of byImportance) {
      const at = map.project([stop.lon, stop.lat]);
      if (placed.every((other) => Math.hypot(at.x - other.x, at.y - other.y) >= MIN_GAP)) {
        placed.push({ x: at.x, y: at.y });
        keep.push(stop);
      }
    }
    return keep;
  }, [stops, map, settled, filter, selectedStopId]);

  /*
   * What is actually on screen, out of what has been fetched.
   *
   * Recomputed when the map settles as well as when the answer changes, because
   * panning and zooming inside the covered area changes this without changing
   * that — which is exactly the case the list used to get wrong.
   */
  const inView = useMemo(() => {
    void settled;

    const box = map.getBounds();
    const south = box.getSouth();
    const north = box.getNorth();
    const west = box.getWest();
    const east = box.getEast();

    return stops.filter(
      (stop) =>
        stop.lat >= south && stop.lat <= north && stop.lon >= west && stop.lon <= east,
    );
  }, [stops, map, settled]);

  // Reported after render rather than during it: setting another component's
  // state is not something a render is allowed to do.
  useEffect(() => {
    visibleChanged.current?.(inView);
  }, [inView]);

  const label = hovered === null ? null : map.project([hovered.lon, hovered.lat]);

  return (
    <>
      {drawn.map((stop) => (
        <MapMarker
          key={stop.id}
          position={[stop.lat, stop.lon]}
          /*
           * Always takes the pointer, because the name appears on hover and a
           * marker with `pointer-events: none` is never hovered.
           *
           * The cost is that a press on a stop cannot also reach the ground
           * beneath it, so a stop layer drawn without somewhere to open a stop
           * into would quietly eat the planner's point chooser. All three maps
           * pass `onStopSelect`, so today that press always has somewhere to
           * go; a fourth that did not would need to answer this.
           */
          interactive
          {...(onStopSelect === undefined
            ? {}
            : { onClick: () => onStopSelect(stop.id) })}
        >
          <StopPin
            modes={stop.modes}
            selected={stop.id === selectedStopId}
            clickable={onStopSelect !== undefined}
            onEnter={() => {
              onStopHover();
              setHovered(stop);
            }}
            onLeave={() =>
              setHovered((current) => (current === stop ? null : current))
            }
          />
        </MapMarker>
      ))}

      {/*
        The name, drawn rather than delegated.

        A popup would bring an open animation and a lifecycle keyed on its
        position; this is positioned from the projected point instead, centred
        by a transform, which needs no knowledge of how wide the name is.

        `left` rather than `start`: the anchor is a point on the ground, placed
        by projection in physical pixels, and the map does not flip with the
        document.
      */}
      {hovered !== null && label !== null && (
        <div
          // Nothing to click, and it must not steal the hover that summoned it.
          className="pointer-events-none absolute z-[900] -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: label.x, top: label.y }}
        >
          <span className="rounded-control border-border bg-surface-raised shadow-card motion-safe:animate-fade-in flex w-max items-center gap-1 border px-2 py-1 text-xs">
            <span dir="auto" className="font-semibold">
              {hovered.name}
            </span>
            {hovered.code !== null && (
              <span className="text-content-muted">· {hovered.code}</span>
            )}
          </span>
        </div>
      )}
    </>
  );
}

/**
 * One stop, as its mode.
 *
 * A stop served by several takes the first, because a marker has room for one
 * silhouette — and the tooltip carries the name, which is what somebody is
 * really after when several stops share a corner.
 *
 * A small square, not a circle. Every marker the journey puts on this map is
 * round — the two ends, the stops it calls at, the dots it rides through — and
 * a round stop marker joined that set, so the network read as loudly as the
 * journey drawn over it. A different shape at half the size says "this is the
 * ground", and leaves the circles to mean "this is your journey".
 *
 * The chosen one is the exception: it grows and drops the transparency the
 * rest wear. Size and weight rather than colour, because the mode already owns
 * the colour here — a "selected" hue would either fight it or replace the one
 * piece of information the marker carries.
 */
function StopPin({
  modes,
  selected,
  clickable,
  onEnter,
  onLeave,
}: {
  modes: NetworkStop['modes'];
  selected: boolean;
  clickable: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const mode = modes[0];
  const known = mode !== undefined;
  const ink = known ? visualForFamily(familyFor(mode)).ink : 'text-content-muted';
  const skin = selected
    ? 'h-6 w-6 opacity-100 border-2 ring-2 ring-current shadow-card'
    : 'h-4 w-4 opacity-70 border hover:opacity-100';

  return (
    <span
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`${ink} ${skin} ${clickable ? 'cursor-pointer' : ''} bg-surface-raised border-current flex items-center justify-center rounded-[3px] transition-opacity`}
    >
      {known ? (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: modeIconMarkup(familyFor(mode)) }}
        />
      ) : (
        <span className="bg-current block h-1.5 w-1.5 rounded-full" />
      )}
    </span>
  );
}
