import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../theme';
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
import { MapMarker } from './MapMarker';
import { RouteVehicles } from './RouteVehicles';
import { StopLayer } from './StopLayer';
import { useMap, useMapEvent } from './mapContext';
import { useGeoJson } from './useGeoJson';
import {
  lineLayers,
  pointCollection,
  segmentCollection,
  stopCircleLayers,
  type DrawnPoint,
} from './journeyLayers';
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
 * Keeps the map on a moving point.
 *
 * `easeTo` rather than a jump, and only once the point has actually changed: a
 * vehicle a few metres further along should slide the map, not re-place it, and
 * re-issuing the same centre on every render fights the reader's own dragging.
 * The zoom is raised once, on arrival, and left alone after — a map that
 * re-zoomed on every tick could never be pulled back out.
 */
function Chase({ point, animate }: { point: Coordinates; animate: boolean }) {
  const map = useMap();
  const [lat, lon] = point;

  useEffect(() => {
    // Close enough to read the street the vehicle is on, and never further out
    // than wherever the reader has already taken the map.
    map.easeTo({
      center: [lon, lat],
      zoom: Math.max(map.getZoom(), 15),
      animate,
    });
    // Deliberately keyed on the numbers rather than the array: a fresh tuple
    // with the same coordinates is not a move.
  }, [map, lat, lon, animate]);

  return null;
}

/**
 * Opens the stop somebody presses.
 *
 * The circles are a GL layer rather than a stack of elements, so a press is
 * answered by asking the map what is under the pointer instead of by a handler
 * hung on each circle. The stop's id travels on the feature for exactly this —
 * see `DrawnPoint`.
 */
function StopCircleClicks({
  layer,
  onStopSelect,
}: {
  layer: string;
  onStopSelect: (stopId: string) => void;
}) {
  const map = useMap();
  const latest = useRef(onStopSelect);

  // In an effect, not during render — see `useMapEvent` in `mapContext.ts`.
  useEffect(() => {
    latest.current = onStopSelect;
  });

  useMapEvent('click', (event) => {
    const hit = map.queryRenderedFeatures(event.point, { layers: [layer] });
    const id = hit[0]?.properties?.['id'];
    if (typeof id !== 'string') return;
    latest.current(id);
  });

  useEffect(() => {
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('mouseenter', layer, enter);
    map.on('mouseleave', layer, leave);
    return () => {
      map.off('mouseenter', layer, enter);
      map.off('mouseleave', layer, leave);
    };
  }, [map, layer]);

  return null;
}

/** The drawn line and its stop circles, as the two overlays that paint them. */
function RouteShapes({
  path,
  stops,
  family,
  scheme,
}: {
  path: Coordinates[] | null;
  stops: DrawnPoint[];
  family: string | null;
  scheme: string;
}) {
  /*
   * Rebuilt when the scheme changes, because the colours inside are resolved
   * values rather than class names — a token remapped to its dark twin
   * produces different data, not merely a different stylesheet.
   */
  const line = useMemo(() => {
    void scheme;
    if (path === null) return null;
    return segmentCollection([{ path, family, walk: false, legIndex: 0 }]);
  }, [path, family, scheme]);

  const circles = useMemo(() => {
    void scheme;
    return pointCollection(stops);
  }, [stops, scheme]);

  const linePaint = useMemo(() => {
    void scheme;
    return lineLayers();
  }, [scheme]);

  const circlePaint = useMemo(() => {
    void scheme;
    return stopCircleLayers();
  }, [scheme]);

  useGeoJson('route-line', line, linePaint);
  useGeoJson('route-stops', circles, circlePaint);

  return null;
}

/**
 * One line drawn on the ground.
 *
 * The same notation as the journey map, because it is the same alphabet: the
 * vehicle's own colour, cased against the page's surface, a ring where you can
 * get on and off. Somebody who has read a journey should not have to learn this.
 *
 * The two ends get the traveller's own marks and the stops between them a small
 * dot. Deliberately *not* origin and destination in the planner's sense — a
 * line has no traveller — but the same shapes, because where a line starts and
 * ends is the same kind of fact.
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
  const { resolved } = useTheme();

  const family = variant === null ? null : familyFor(variant.routeType);
  /* The end markers are filled with `currentColor`, so they want the ink. */
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

  /* The stops between the two ends, which have markers of their own. */
  const middle = useMemo<DrawnPoint[]>(() => {
    if (variant === null) return [];
    return variant.stops
      .slice(1, Math.max(variant.stops.length - 1, 1))
      .map((stop) => ({
        point: [stop.lat, stop.lon] as Coordinates,
        family,
        call: false,
        id: stop.id,
      }));
  }, [variant, family]);

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

  const first = variant?.stops[0];
  const last =
    variant !== null && variant.stops.length > 1
      ? variant.stops[variant.stops.length - 1]
      : undefined;

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

      <RouteShapes path={path} stops={middle} family={family} scheme={resolved} />

      {/*
        Pressable, and out of the tab order without being asked — a GL layer
        has no element to tab to. The list beside the map is the keyboard's way
        to every one of these.
      */}
      <StopCircleClicks layer="route-stops-passed" onStopSelect={onStopSelect} />

      {/*
        A variant on its way holds the map still rather than sending it home
        and back — two animated moves collide, and what a reader sees is the
        zoom out and no zoom back in. One or the other, never both: two effects
        moving the same map race, and the loser is whichever ran first.
      */}
      {!pending &&
        (chasing === null ? (
          <FitTo box={box} home={home} animate={!reduceMotion} />
        ) : (
          <Chase point={chasing} animate={!reduceMotion} />
        ))}

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
        were looking at without following the whole thing.

        The origin takes the line's colour, because where a line *starts* is a
        fact about that line; the destination keeps the brand pin it wears
        everywhere, because an end is an end.
      */}
      {first !== undefined && (
        <MapMarker position={[first.lat, first.lon]}>
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            aria-hidden="true"
            className={`${text} block`}
            dangerouslySetInnerHTML={{ __html: originMarkerMarkup('fill-surface') }}
          />
        </MapMarker>
      )}

      {last !== undefined && (
        <MapMarker
          position={[last.lat, last.lon]}
          // A pin stands on its tip rather than being centred on its point.
          anchor="bottom"
        >
          <svg
            viewBox="0 0 24 24"
            width="34"
            height="34"
            aria-hidden="true"
            className="text-brand-500 block"
            dangerouslySetInnerHTML={{
              __html: destinationMarkerMarkup('fill-surface'),
            }}
          />
        </MapMarker>
      )}
    </MapCanvas>
  );
}
