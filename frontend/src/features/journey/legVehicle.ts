import {
  bearingBetween,
  distance,
  pointAtDistance,
  projectOnSegment,
  type ProjectedShape,
} from '../routes/shapeProjection';
import { absoluteSeconds } from '../routes/vehicleProgress';
import type { Coordinates, TransitLeg } from '../../types/journey';

/**
 * Where a ridden leg's own vehicle is right now, drawn from the leg alone.
 *
 * `vehicleProgress.ts` answers the same question for a whole day's timetable,
 * matched to a pattern's stop sequence — everything this needs to ask it of
 * one itinerary's own leg instead. A leg does not carry a pattern or a
 * sequence, only its own two ends, the stops it calls at between them, and the
 * shape it rode; that is a shorter, looser record; but it is also, for exactly
 * the trip a traveller is looking at, a complete one.
 *
 * Scheduled position, not observed, for the same reason it is everywhere else
 * in this app: the compiled feed carries no live vehicle data. Where the
 * timetable says this leg's vehicle should be, right now.
 */

export interface LegVehiclePosition {
  point: Coordinates;
  /** Compass degrees, 0 north and 90 east — which way the vehicle is facing. */
  bearing: number;
}

interface Waypoint {
  lat: number;
  lon: number;
  atSeconds: number;
}

/**
 * The leg's own ends and its intermediate calls, as one ordered timeline.
 *
 * An intermediate stop's `stopArrivalTime` carries no date of its own — unlike
 * the leg's `startDate`/`endDate`, which the API always supplies — so the date
 * is inferred from order: a leg is one continuous ride, so its calls run
 * chronologically, and the first one to read *earlier* on the clock than the
 * call before it is the one where the ride crossed midnight. Everything before
 * that belongs to `startDate`, everything from it on to `endDate`.
 */
function waypointsFor(leg: TransitLeg): Waypoint[] | null {
  const start = absoluteSeconds(leg.startDate, leg.startTime);
  const end = absoluteSeconds(leg.endDate, leg.endTime);
  if (start === null || end === null) return null;

  const middle: Waypoint[] = [];
  let rolledOver = false;
  let previousClock = leg.startTime;

  for (const stop of leg.intermediateStops) {
    if (stop.stopArrivalTime < previousClock) rolledOver = true;
    previousClock = stop.stopArrivalTime;

    const atSeconds = absoluteSeconds(
      rolledOver ? leg.endDate : leg.startDate,
      stop.stopArrivalTime,
    );
    if (atSeconds === null) continue;
    middle.push({ lat: stop.stopLat, lon: stop.stopLon, atSeconds });
  }

  return [
    { lat: leg.fromStop.lat, lon: leg.fromStop.lon, atSeconds: start },
    ...middle,
    { lat: leg.toStop.lat, lon: leg.toStop.lon, atSeconds: end },
  ];
}

/** The leg's own shape, measured the same way a pattern's is. */
function measuredShape(leg: TransitLeg): ProjectedShape | null {
  const points = leg.shape;
  if (points.length < 2) return null;

  const cumulative: number[] = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(
      (cumulative[index - 1] as number) +
        distance(points[index - 1] as Coordinates, points[index] as Coordinates),
    );
  }

  // Unused here: `pointAtDistance` never reads it, and this shape has no
  // pattern sequence to key it by in the first place.
  return { points, cumulative, atStop: new Map() };
}

/** How far along the shape each waypoint falls, searching forward only. */
function distancesAlongShape(shape: ProjectedShape, waypoints: Waypoint[]): number[] {
  const out: number[] = [];
  let searchFrom = 0;

  for (const waypoint of waypoints) {
    const point: Coordinates = [waypoint.lat, waypoint.lon];
    let best = { segment: searchFrom, t: 0, gap: Infinity };

    for (let index = searchFrom; index < shape.points.length - 1; index += 1) {
      const projected = projectOnSegment(
        point,
        shape.points[index] as Coordinates,
        shape.points[index + 1] as Coordinates,
      );
      if (projected.gap < best.gap) best = { segment: index, t: projected.t, gap: projected.gap };
    }

    const segStart = shape.cumulative[best.segment] as number;
    const segEnd = shape.cumulative[best.segment + 1] as number;
    out.push(segStart + best.t * (segEnd - segStart));
    searchFrom = best.segment;
  }

  return out;
}

/**
 * Where this leg's vehicle is at `atSeconds`, or null when it has not set off
 * yet, or when the leg's own times cannot be read at all.
 *
 * No upper bound. A leg's own last call is where *this traveller* gets off,
 * not where the vehicle's run ends — the trip carries on, and a rider still
 * approaching the stop or already aboard has every reason to find it on the
 * map right up to the moment they board and for as long as it stays theirs to
 * watch, not only while `atSeconds` sits inside the narrow window between
 * boarding and alighting. Past the last call this leg has data for, the
 * vehicle is pinned at that final point — the last place this leg's own
 * record can actually put it — rather than vanishing the instant the
 * timetable says this rider's own stretch of the ride is over.
 */
export function legVehiclePosition(
  leg: TransitLeg,
  atSeconds: number,
): LegVehiclePosition | null {
  const waypoints = waypointsFor(leg);
  if (waypoints === null || waypoints.length < 2) return null;

  const first = waypoints[0] as Waypoint;
  const last = waypoints[waypoints.length - 1] as Waypoint;
  if (atSeconds < first.atSeconds) return null;

  const shape = measuredShape(leg);
  const along = shape === null ? null : distancesAlongShape(shape, waypoints);

  if (atSeconds >= last.atSeconds) {
    const secondLast = waypoints[waypoints.length - 2] as Waypoint;

    if (shape !== null && along !== null) {
      const found = pointAtDistance(shape, along[along.length - 1] as number);
      if (found !== null) return found;
    }

    return {
      point: [last.lat, last.lon],
      bearing: bearingBetween([secondLast.lat, secondLast.lon], [last.lat, last.lon]),
    };
  }

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const a = waypoints[index] as Waypoint;
    const b = waypoints[index + 1] as Waypoint;
    if (atSeconds < a.atSeconds || atSeconds > b.atSeconds) continue;

    const span = b.atSeconds - a.atSeconds;
    // A zero-length span means two calls share a time; the honest answer is
    // "at the first of them" rather than a division by zero.
    const fraction = span <= 0 ? 0 : (atSeconds - a.atSeconds) / span;

    if (shape !== null && along !== null) {
      const start = along[index] as number;
      const end = along[index + 1] as number;
      const found = pointAtDistance(shape, start + fraction * (end - start));
      if (found !== null) return found;
    }

    // Falls back to a straight line between the two calls when the shape is
    // missing or too short to measure — off the road, but not off the map.
    const pa: Coordinates = [a.lat, a.lon];
    const pb: Coordinates = [b.lat, b.lon];
    return {
      point: [pa[0] + fraction * (pb[0] - pa[0]), pa[1] + fraction * (pb[1] - pa[1])],
      bearing: bearingBetween(pa, pb),
    };
  }

  return null;
}
