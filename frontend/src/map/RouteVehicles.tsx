import { useMemo } from 'react';
import { familyFor } from '../features/journey/modeVisuals';
import {
  pointBetweenStops,
  type ProjectedShape,
} from '../features/routes/shapeProjection';
import { vehicleMarkup } from '../features/routes/vehicleMarkup';
import type { Vehicle } from '../features/routes/vehicleProgress';
import type { LineVariantDetail } from '../types/route';
import { MapMarker } from './MapMarker';

interface Props {
  variant: LineVariantDetail;
  /** The vehicles out on this pattern, from the day's own timetable. */
  vehicles: Vehicle[];
  /**
   * Follows the run a pressed vehicle is on, or null to leave them as pictures.
   *
   * Null also makes them non-interactive, which matters here: a marker that
   * accepts clicks swallows them, so a decoration left interactive would
   * quietly eat presses meant for the line or a stop underneath it.
   */
  onFollow?: ((tripId: string) => void) | null | undefined;
  /**
   * The measured shape, from the map that owns it.
   *
   * Measured there rather than here because the map needs it too — to keep
   * itself on a followed vehicle — and measuring the same line twice a tick is
   * the one part of this that would actually cost something.
   */
  projected: ProjectedShape | null;
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
export function RouteVehicles({
  variant,
  vehicles,
  onFollow = null,
  projected,
}: Props) {
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

        const tripId = vehicle.trip.tripId;
        const follow =
          onFollow === null || tripId === null ? null : () => onFollow(tripId);

        return (
          <MapMarker
            /*
             * Keyed by trip, so a vehicle moving is the *same* marker moving
             * rather than one being destroyed and another built a few metres
             * on. The marker then repositions the element it already has,
             * which is both cheaper and what keeps the halo's animation from
             * restarting on every tick.
             */
            key={vehicle.trip.tripId ?? `${vehicle.progress.fromSequence}`}
            position={placed.point}
            interactive={follow !== null}
            {...(follow === null ? {} : { onClick: follow })}
            // Above the line and the stop circles, which it is travelling over.
            zIndex={1000}
          >
            <VehicleBadge
              family={familyFor(variant.routeType)}
              bearing={placed.bearing}
              designation={variant.routeShortName}
            />
          </MapMarker>
        );
      })}
    </>
  );
}

/**
 * The badge, from the same builder the sidebar draws with.
 *
 * Markup rather than JSX because it has two renderers and they must not drift
 * — the spine beside the map draws these too. Not memoised: the bearing
 * changes with almost every tick, so a cache keyed on it would grow without
 * ever being hit.
 */
export function VehicleBadge({
  family,
  bearing,
  designation,
}: {
  family: string;
  bearing: number;
  designation: string;
}) {
  return (
    <span
      className="route-vehicle-marker block"
      dangerouslySetInnerHTML={{ __html: vehicleMarkup(family, bearing, designation) }}
    />
  );
}
