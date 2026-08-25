import { Fragment, useEffect, useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, Marker, Polyline, useMap } from 'react-leaflet';
import type { GeoBounds } from '../config/geocoding';
import type { Coordinates } from '../types/journey';
import type { LineVariantDetail } from '../types/route';
import { familyFor, visualForFamily } from '../features/journey/modeVisuals';
import {
  destinationMarkerMarkup,
  originMarkerMarkup,
} from '../features/journey/placeMarkerMarkup';
import {
  pointBetweenStops,
  projectShape,
  type ProjectedShape,
} from '../features/routes/shapeProjection';
import type { Vehicle } from '../features/routes/vehicleProgress';
import { MapCanvas, FitTo } from './MapCanvas';
import { RouteVehicles } from './RouteVehicles';
import { StopLayer } from './StopLayer';
import { homeViewFor, ROUTE_STOPS_MIN_ZOOM } from './homeView';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  network: string | null;
  area: GeoBounds | null;
  /** The variant being inspected, once it is known. */
  variant: LineVariantDetail | null;
  /**
   * A variant is wanted but has not arrived yet.
   *
   * Distinct from `variant === null`, which alone cannot tell "the index,
   * showing the city" from "a line is loading". They want opposite things from
   * the map: one wants the city, the other wants to be left alone.
   */
  pending: boolean;
  onStopSelect: (stopId: string) => void;
  /** The vehicles out on this pattern now. Empty on a day that is not today. */
  vehicles: Vehicle[];
  /** Follows the run a pressed vehicle is on. Null leaves them as pictures. */
  onFollowTrip?: ((tripId: string) => void) | null | undefined;
  /**
   * Keep the map on the vehicle rather than on the whole line.
   *
   * Set when one run is being followed. Framing the line end to end is right
   * when the line is the subject; when one vehicle is, the corridor it is
   * somewhere inside is not an answer — you have to find the badge before you
   * can read anything from it.
   */
  chase?: boolean | undefined;
}

/**
 * The line's two ends, as Leaflet markers.
 *
 * Built from the same markup the interface draws, so the pin on the map and the
 * pin on the spine cannot drift apart — the arrangement the mode silhouettes
 * and the vehicle badge already have.
 */
function endIcon(end: 'origin' | 'destination', ink: string): L.DivIcon {
  const origin = end === 'origin';
  const size = origin ? 24 : 34;

  return L.divIcon({
    className: 'route-end',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" class="${
      origin ? ink : 'text-brand-500'
    }">${origin ? originMarkerMarkup('fill-surface') : destinationMarkerMarkup('fill-surface')}</svg>`,
    iconSize: [size, size],
    /*
     * A target is centred on its point; a pin stands on its tip. The pin's path
     * reaches y=21.5 of a 24 box, so its point is a whisker above the bottom.
     */
    iconAnchor: origin ? [size / 2, size / 2] : [size / 2, size * 0.9],
  });
}

/**
 * Keeps the map on a moving point.
 *
 * `panTo` rather than `setView`, and only once the point has actually changed:
 * a vehicle a few metres further along should slide the map, not re-place it,
 * and re-issuing the same centre on every render fights the reader's own
 * dragging. The zoom is raised once, on arrival, and left alone after — a map
 * that re-zoomed on every tick could never be pulled back out.
 */
function Chase({ point, animate }: { point: Coordinates; animate: boolean }) {
  const map = useMap();
  const [lat, lon] = point;

  useEffect(() => {
    // Close enough to read the street the vehicle is on, and never further out
    // than wherever the reader has already taken the map.
    map.setView([lat, lon], Math.max(map.getZoom(), 15), { animate });
    // Deliberately keyed on the numbers rather than the array: a fresh tuple
    // with the same coordinates is not a move.
  }, [map, lat, lon, animate]);

  return null;
}

/**
 * One line drawn on the ground.
 *
 * The same notation as the journey map, because it is the same alphabet: the
 * vehicle's own colour, cased against the page's surface, a ring where you can
 * get on and off. Somebody who has read a journey should not have to learn this.
 *
 * The two ends get a larger open ring and the stops between them a small filled
 * dot — the `calls` and `passed` distinction the journey map already draws.
 * Deliberately *not* the origin and destination pins: those mean the
 * traveller's own two ends, and a line has no traveller.
 *
 * It is never the only route to any of this. Every stop it draws is written out
 * in the list beside it, as a link, which is what lets the markers stay out of
 * the tab order without putting anything out of reach.
 */
export function RouteMap({
  network,
  area,
  variant,
  pending,
  onStopSelect,
  vehicles,
  onFollowTrip = null,
  chase = false,
}: Props) {
  const home = useMemo(() => homeViewFor(network, area), [network, area]);
  const reduceMotion = useReducedMotion();

  const family = variant === null ? null : familyFor(variant.routeType);
  /** For the drawn line and the stop circles, which are strokes. */
  const ink = family === null ? '' : visualForFamily(family).stroke;
  /*
   * And for the end markers, which are filled with `currentColor` — a
   * `stroke-*` class sets the stroke and leaves the fill black.
   */
  const text = family === null ? '' : visualForFamily(family).ink;

  /**
   * What the line is drawn as.
   *
   * The pattern's own geometry when the feed has one, and the stop sequence
   * otherwise — a feed without `shapes.txt` still has a line, it just runs
   * straight between its stops. Two points is the minimum for either.
   */
  const path = useMemo<Coordinates[] | null>(() => {
    if (variant === null) return null;
    if (variant.shape !== null) return variant.shape;

    const stops = variant.stops.map((stop): Coordinates => [stop.lat, stop.lon]);
    return stops.length >= 2 ? stops : null;
  }, [variant]);

  /*
   * The box to frame, memoised because `FitTo` holds it as an effect
   * dependency — a fresh array each render would re-frame the map on every
   * keystroke elsewhere on the page.
   *
   * Built from the drawn line rather than from the stops: a shape can bow well
   * outside the straight line between two stops, and a frame that clips it
   * reads as the line running off the edge of the map.
   */
  const box = useMemo<[Coordinates, Coordinates] | null>(() => {
    if (path === null) return null;

    let minLat = Infinity;
    let minLon = Infinity;
    let maxLat = -Infinity;
    let maxLon = -Infinity;
    for (const [lat, lon] of path) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
    if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return null;

    return [
      [minLat, minLon],
      [maxLat, maxLon],
    ];
  }, [path]);

  /*
   * Every drawn key is scoped to the variant, so switching variant brings a
   * fresh set of layers rather than restyling the last one.
   *
   * That is not tidiness. A Leaflet path's `className` is applied when the
   * element is created and never touched again, while `setStyle` reaches only
   * the options — so a reused layer keeps the class it was born with. Moving
   * from a bus line to a tram one repainted nothing: the second wore the
   * first's colours the whole way down.
   */
  /*
   * Measured once per variant, and shared with the layer that draws the
   * vehicles — the same measurement answering the same question twice would be
   * the expensive part of a tick.
   */
  const projected = useMemo<ProjectedShape | null>(
    () =>
      variant === null || variant.shape === null
        ? null
        : projectShape(variant.shape, variant.stops),
    [variant],
  );

  const scope = variant === null ? 'none' : `${variant.lineId}-${variant.patternId}`;

  /**
   * Where the followed vehicle is, when there is one to follow.
   *
   * Null the rest of the time, which is what hands framing back to the line.
   * Only ever one: following a run, the inspector filters the vehicles down to
   * that run's own, so a second here would mean something else had gone wrong.
   */
  const chasing = useMemo<Coordinates | null>(() => {
    if (!chase || variant === null) return null;
    const vehicle = vehicles[0];
    if (vehicle === undefined) return null;

    const from = variant.stops.find(
      (stop) => stop.sequence === vehicle.progress.fromSequence,
    );
    if (from === undefined) return null;

    const to =
      vehicle.progress.toSequence === null
        ? null
        : (variant.stops.find((stop) => stop.sequence === vehicle.progress.toSequence) ??
          null);

    return pointBetweenStops(projected, from, to, vehicle.progress.fraction)?.point ?? null;
  }, [chase, variant, vehicles, projected]);

  return (
    <MapCanvas network={network}>
      {/*
        Drawn under the line: context, not the subject — and held back two zoom
        levels further in than the stops page for exactly that reason. A line
        framed end to end covers a whole corridor, and filling it with every
        other stop in the city buries the one thing the reader came for.
      */}
      <StopLayer
        onStopHover={() => {}}
        onStopSelect={onStopSelect}
        minZoom={ROUTE_STOPS_MIN_ZOOM}
      />

      {/*
        A variant on its way holds the map still rather than sending it home
        and back — two animated moves collide, and what a reader sees is the
        zoom out and no zoom back in. The lesson the stops map recorded.
      */}
      {/*
        One or the other, never both. Two effects moving the same map race, and
        the loser is whichever ran first — which is how a map ends up framing a
        whole line for one frame and then snapping to a vehicle.
      */}
      {!pending &&
        (chasing === null ? (
          <FitTo box={box} home={home} animate={!reduceMotion} />
        ) : (
          <Chase point={chasing} animate={!reduceMotion} />
        ))}

      {path !== null && (
        <Fragment key={`${scope}-line`}>
          {/*
            Drawn twice. The casing underneath is the page's own surface
            colour, which is what keeps a dark blue line from disappearing into
            dark water and a pale one from washing out over a light map. It is
            ordinary transit cartography and it leaves the colour untouched.
          */}
          <Polyline
            positions={path}
            className="stroke-surface"
            pathOptions={{ weight: 10, opacity: 0.9 }}
            interactive={false}
          />
          <Polyline
            positions={path}
            className={ink}
            pathOptions={{ weight: 6, opacity: 1 }}
            interactive={false}
          />
        </Fragment>
      )}

      {/* Over the line and its stops, because it is travelling along them. */}
      {variant !== null && vehicles.length > 0 && (
        <RouteVehicles
          variant={variant}
          vehicles={vehicles}
          onFollow={onFollowTrip}
          projected={projected}
        />
      )}

      {/*
        The two ends, as the marks this app already uses for them.

        A slightly larger circle among circles is not a distinction anybody
        reads — on a line that doubles back you could not tell which end you
        were looking at without following the whole thing. These are the same
        target and pin the planner puts on a journey's ends.

        The origin takes the line's colour, because where a line *starts* is a
        fact about that line; the destination keeps the brand pin it wears
        everywhere, because an end is an end.
      */}
      {variant !== null && variant.stops.length > 0 && (
        <Fragment key={`${scope}-ends`}>
          <Marker
            position={[variant.stops[0]!.lat, variant.stops[0]!.lon]}
            icon={endIcon('origin', text)}
            interactive={false}
            keyboard={false}
          />
          {variant.stops.length > 1 && (
            <Marker
              position={[
                variant.stops[variant.stops.length - 1]!.lat,
                variant.stops[variant.stops.length - 1]!.lon,
              ]}
              icon={endIcon('destination', text)}
              interactive={false}
              keyboard={false}
            />
          )}
        </Fragment>
      )}

      {variant?.stops.map((stop, index) => {
        // The ends have their own markers above; a circle under them would
        // show through the pin's cut-out centre.
        if (index === 0 || index === variant.stops.length - 1) return null;

        return (
          <CircleMarker
            key={`${scope}-${stop.sequence}-${stop.id}`}
            center={[stop.lat, stop.lon]}
            radius={3.5}
            className={`${ink} fill-surface`}
            pathOptions={{ weight: 2, opacity: 1, fillOpacity: 1 }}
            /*
              Pressable, and out of the tab order without being asked: a Leaflet
              path is an SVG element with no tabindex, unlike a marker, which
              needs `keyboard={false}` to be kept out. Either way the list
              beside the map is the keyboard's way to every one of these.
            */
            interactive
            eventHandlers={{ click: () => onStopSelect(stop.id) }}
          />
        );
      })}
    </MapCanvas>
  );
}
