import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
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
 * Street level, deliberately. At a district's worth of zoom the stops are
 * dense enough to read as a pattern rather than as places, and they crowd the
 * journey — which is what the map is for. They belong to the moment you are
 * looking at one neighbourhood and want to know what is on the corner.
 */
const MIN_ZOOM = 16;

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
    html: `<span class="${ink} bg-surface-raised border-current absolute top-0 left-0 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[3px] border shadow-sm">${glyph}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function StopLayer() {
  const map = useMap();
  const [stops, setStops] = useState<NetworkStop[]>([]);
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

  useMapEvents({ moveend: refresh, zoomend: refresh });

  useEffect(() => {
    refresh();
    return () => {
      window.clearTimeout(timer.current);
      request.current?.abort();
    };
    // Runs once: everything after the first look is driven by map events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return (
    <>
      {stops.map((stop) => (
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
        >
          <Tooltip direction="top" offset={[0, -14]}>
            <span dir="auto" className="font-semibold">
              {stop.name}
            </span>
            {stop.code !== null && (
              <span className="text-content-muted"> · {stop.code}</span>
            )}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
