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
function stopIcon(modes: NetworkStop['modes']): L.DivIcon {
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
   */
  return L.divIcon({
    className: 'network-stop',
    html: `<span class="${ink} bg-surface-raised border-current absolute top-0 left-0 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[3px] border opacity-70 transition-opacity hover:opacity-100">${glyph}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function StopLayer({ onStopHover }: { onStopHover: () => void }) {
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

  const refresh = () => {
    window.clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      if (map.getZoom() < MIN_ZOOM) {
        request.current?.abort();
        covered.current = null;
        setStops((current) => (current.length === 0 ? current : []));
        return;
      }

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

    const byImportance = [...stops].sort(
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
  }, [stops, map, settled]);

  const label = hovered === null ? null : map.latLngToContainerPoint([hovered.lat, hovered.lon]);

  return (
    <>
      {drawn.map((stop) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lon]}
          icon={stopIcon(stop.modes)}
          /*
           * Interactive so the name appears on hover, but out of the tab order.
           * There are hundreds of these and nothing to do with one yet, so
           * making each a tab stop would bury every real control on the page
           * behind them. It goes back when there is a timetable to open, which
           * is the point at which they become worth reaching.
           */
          keyboard={false}
          eventHandlers={{
            mouseover: () => {
              onStopHover();
              setHovered(stop);
            },
            mouseout: () => setHovered((current) => (current === stop ? null : current)),
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
