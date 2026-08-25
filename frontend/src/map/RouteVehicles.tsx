import { useMemo } from 'react';
import L from 'leaflet';
import { Marker } from 'react-leaflet';
import { familyFor } from '../features/journey/modeVisuals';
import {
  pointBetweenStops,
  projectShape,
  type ProjectedShape,
} from '../features/routes/shapeProjection';
import { VEHICLE_SIZE, vehicleMarkup } from '../features/routes/vehicleMarkup';
import type { Vehicle } from '../features/routes/vehicleProgress';
import type { GtfsRouteType } from '../types/journey';
import type { LineVariantDetail } from '../types/route';

interface Props {
  variant: LineVariantDetail;
  /** The vehicles out on this pattern, from the day's own timetable. */
  vehicles: Vehicle[];
}

/**
 * The vehicles on the line, on the road.
 *
 * Placed **along the drawn shape** rather than between the two stops either
 * side of them. Interpolated stop to stop, a vehicle cuts every corner — it
 * leaves the road at each bend, and on a line that follows a bay or a ring road
 * it crosses ground the vehicle never touches. `shapeProjection` measures the
 * shape once and pins each stop to a distance along it, after which a position
 * is a lerp and a lookup.
 *
 * Out of the tab order, like every other marker on this map: the sidebar draws
 * the same vehicles down its spine, and that is the accessible route to them.
 *
 * These are **scheduled** positions, not observed ones. The compiled feed has
 * no live vehicle data, so what is drawn is where the timetable says a vehicle
 * should be — which the panel beside it says in words rather than leaving the
 * map to imply otherwise.
 */
export function RouteVehicles({ variant, vehicles }: Props) {
  /*
   * Measured once per variant. It is O(shape × stops) — a few hundred points
   * against a few dozen stops — and it must not run on every tick of the clock.
   */
  const projected = useMemo<ProjectedShape | null>(
    () => (variant.shape === null ? null : projectShape(variant.shape, variant.stops)),
    [variant],
  );

  const bySequence = useMemo(
    () => new Map(variant.stops.map((stop) => [stop.sequence, stop])),
    [variant],
  );

  return (
    <>
      {vehicles.map((vehicle) => {
        const from = bySequence.get(vehicle.progress.fromSequence);
        if (from === undefined) return null;

        const to =
          vehicle.progress.toSequence === null
            ? null
            : (bySequence.get(vehicle.progress.toSequence) ?? null);

        const placed = pointBetweenStops(projected, from, to, vehicle.progress.fraction);
        if (placed === null) return null;

        return (
          <Marker
            /*
             * Keyed by trip, so a vehicle moving is the *same* marker moving
             * rather than one being destroyed and another built a few metres
             * on. Leaflet then repositions the element it already has, which is
             * both cheaper and what lets a CSS transition ever be added.
             */
            key={vehicle.trip.tripId ?? `${vehicle.progress.fromSequence}`}
            position={placed.point}
            icon={iconFor(variant.routeType, placed.bearing)}
            interactive={false}
            keyboard={false}
            // Above the line and the stop circles, which it is travelling over.
            zIndexOffset={1000}
          />
        );
      })}
    </>
  );
}

/**
 * Leaflet builds a marker from an HTML string, so the badge arrives as markup.
 *
 * Not memoised: the bearing changes with almost every tick, so a cache keyed on
 * it would grow without ever being hit. Building one small SVG string a few
 * times a second is not the expensive part of a map.
 */
function iconFor(routeType: GtfsRouteType, bearing: number): L.DivIcon {
  return L.divIcon({
    // The badge inside carries `route-vehicle`; this is only Leaflet's wrapper,
    // and naming both the same would double every count of them.
    className: 'route-vehicle-marker',
    html: vehicleMarkup(familyFor(routeType), bearing),
    iconSize: [VEHICLE_SIZE, VEHICLE_SIZE],
    iconAnchor: [VEHICLE_SIZE / 2, VEHICLE_SIZE / 2],
  });
}
