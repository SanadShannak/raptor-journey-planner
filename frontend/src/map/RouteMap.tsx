import { Fragment, useMemo } from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import type { GeoBounds } from '../config/geocoding';
import type { Coordinates } from '../types/journey';
import type { LineVariantDetail } from '../types/route';
import { familyFor, visualForFamily } from '../features/journey/modeVisuals';
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
}: Props) {
  const home = useMemo(() => homeViewFor(network, area), [network, area]);
  const reduceMotion = useReducedMotion();

  const family = variant === null ? null : familyFor(variant.routeType);
  const ink = family === null ? '' : visualForFamily(family).stroke;

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
  const scope = variant === null ? 'none' : `${variant.lineId}-${variant.patternId}`;

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
      {!pending && <FitTo box={box} home={home} animate={!reduceMotion} />}

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
        <RouteVehicles variant={variant} vehicles={vehicles} />
      )}

      {variant?.stops.map((stop, index) => {
        const end = index === 0 || index === variant.stops.length - 1;

        return (
          <CircleMarker
            key={`${scope}-${stop.sequence}-${stop.id}`}
            center={[stop.lat, stop.lon]}
            radius={end ? 6 : 3.5}
            className={`${ink} fill-surface`}
            pathOptions={{ weight: end ? 3 : 2, opacity: 1, fillOpacity: 1 }}
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
