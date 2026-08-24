import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import { getStopsInBounds } from '../api/stops';
import type { GeoBounds } from '../config/geocoding';
import type { NetworkStop } from '../types/stop';
import { familyFor, visualForFamily } from '../features/journey/modeVisuals';
import {
  ICON_SVG_ATTRIBUTES,
  modeIconMarkup,
} from '../features/journey/modeIconMarkup';

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
 */

/**
 * Below this the answer is a texture rather than a map.
 *
 * Neighbourhood level. Far enough out to be useful while looking at a journey
 * rather than only while looking at a corner, and close enough in that the
 * thinning below has room to leave most of them standing. Further out than
 * this they read as a pattern rather than as places, and they crowd the
 * journey, which is what the map is for.
 */
const MIN_ZOOM = 15;

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

function padded(bounds: L.LatLngBounds): GeoBounds {
  const latPad = (bounds.getNorth() - bounds.getSouth()) * OVERSCAN;
  const lonPad = (bounds.getEast() - bounds.getWest()) * OVERSCAN;

  return {
    minLat: bounds.getSouth() - latPad,
    minLon: bounds.getWest() - lonPad,
    maxLat: bounds.getNorth() + latPad,
    maxLon: bounds.getEast() + lonPad,
  };
}

const covers = (outer: GeoBounds, inner: L.LatLngBounds): boolean =>
  outer.minLat <= inner.getSouth() &&
  outer.minLon <= inner.getWest() &&
  outer.maxLat >= inner.getNorth() &&
  outer.maxLon >= inner.getEast();

/**
 * One stop, as its mode.
 *
 * A stop served by several takes the first, because a marker has room for one
 * silhouette — and the tooltip carries the name, which is what somebody is
 * really after when several stops share a corner.
 */
function stopIcon(
  modes: NetworkStop['modes'],
  selected: boolean,
  clickable: boolean,
): L.DivIcon {
  const mode = modes[0];
  const known = mode !== undefined;
  const ink = known ? visualForFamily(familyFor(mode)).ink : 'text-content-muted';
  const glyph = known
    ? `<svg ${ICON_SVG_ATTRIBUTES} width="11" height="11">${modeIconMarkup(familyFor(mode))}</svg>`
    : '<span class="bg-current block h-1.5 w-1.5 rounded-full"></span>';

  /*
   * A small square, not a circle.
   *
   * Every marker the journey puts on this map is round — the two ends, the
   * stops it calls at, the dots it rides through — and a round stop marker
   * joined that set, so the network read as loudly as the journey drawn over
   * it. A different shape at half the size says "this is the ground", and
   * leaves the circles to mean "this is your journey".
   *
   * The chosen one is the exception: it grows and drops the transparency the
   * rest wear. Size and weight rather than colour, because the mode already
   * owns the colour here — a "selected" hue would either fight it or replace
   * the one piece of information the marker carries.
   */
  const skin = selected
    ? 'h-6 w-6 opacity-100 border-2 ring-2 ring-current shadow-card z-[500]'
    : 'h-4 w-4 opacity-70 border hover:opacity-100';
  const cursor = clickable ? 'cursor-pointer' : '';

  return L.divIcon({
    className: 'network-stop',
    html: `<span class="${ink} bg-surface-raised border-current absolute top-0 left-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[3px] transition-opacity ${skin} ${cursor}">${glyph}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

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
   * The stops fetched for the current view, handed up so a list beside the map
   * can show them — which is what makes this layer reachable without a
   * pointer, and is why the markers can stay out of the tab order.
   *
   * Unfiltered and unthinned. Thinning is about pixels — two markers on one
   * corner — and a list has no such problem, so it should not inherit the
   * losses.
   */
  onVisibleStopsChange?: ((stops: NetworkStop[]) => void) | undefined;
  /** Says the map is pulled out too far to draw any, which is not "none". */
  onBelowZoomChange?: ((belowZoom: boolean) => void) | undefined;
}

export function StopLayer({
  onStopHover,
  onStopSelect,
  selectedStopId = null,
  filter,
  onVisibleStopsChange,
  onBelowZoomChange,
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
      if (map.getZoom() < MIN_ZOOM) {
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

  useMapEvents({
    moveend: onSettle,
    zoomend: onSettle,
    // The name is placed from a projection, so it belongs to a still map.
    movestart: () => setHovered(null),
    zoomstart: () => setHovered(null),
  });

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

    const placed: L.Point[] = [];
    const keep: NetworkStop[] = [];

    const byImportance = [...(filter === undefined ? stops : stops.filter(filter))].sort(
      (a, b) => b.modes.length - a.modes.length || a.id.localeCompare(b.id),
    );

    for (const stop of byImportance) {
      const at = map.latLngToLayerPoint([stop.lat, stop.lon]);
      if (placed.every((other) => at.distanceTo(other) >= MIN_GAP)) {
        placed.push(at);
        keep.push(stop);
      }
    }
    return keep;
  }, [stops, map, settled, filter]);

  // Reported after render rather than during it: setting another component's
  // state is not something a render is allowed to do.
  useEffect(() => {
    visibleChanged.current?.(stops);
  }, [stops]);

  const label = hovered === null ? null : map.latLngToContainerPoint([hovered.lat, hovered.lon]);

  return (
    <>
      {drawn.map((stop) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lon]}
          icon={stopIcon(stop.modes, stop.id === selectedStopId, onStopSelect !== undefined)}
          /*
           * Out of the tab order, still, now that there is a timetable to open.
           *
           * The earlier reason was that there was nothing to do with one. The
           * reason now is arithmetic: a screen holds tens of these, so making
           * each a tab stop puts tens of them ahead of every real control on
           * the page, and no keyboard user would reach the sidebar.
           *
           * The equivalent action lives outside the map instead — the stops in
           * view are listed beside it, as ordinary buttons in the reading
           * order. That is what the accessibility rule actually asks for: not
           * that the map be operable, but that nothing be reachable only
           * through it.
           */
          keyboard={false}
          eventHandlers={{
            mouseover: () => {
              onStopHover();
              setHovered(stop);
            },
            mouseout: () => setHovered((current) => (current === stop ? null : current)),
            /*
             * Registered only where there is somewhere to open a stop into.
             * A marker that listens for a click consumes it — Leaflet fires on
             * the first target it finds and stops — so an unconditional handler
             * would silently swallow the point chooser for anyone trying to
             * pick a place that happens to sit under a stop.
             */
            ...(onStopSelect === undefined ? {} : { click: () => onStopSelect(stop.id) }),
          }}
        />
      ))}

      {/*
        The name, drawn rather than delegated.
        
        Leaflet's own tooltip measures its width the moment it opens, so that it
        can centre itself over the marker — and react-leaflet fills the content
        in afterwards, through a portal. The measurement was of an empty box,
        and the name landed to one side of the stop it belonged to. Asking for a
        second placement once the content had arrived did not settle it either.

        Positioned here instead, from the point itself. There is nothing to
        measure and nothing to correct: it is centred by a transform, which
        needs no knowledge of how wide the name is. Same conclusion as the point
        chooser reached, for the same reason.

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
