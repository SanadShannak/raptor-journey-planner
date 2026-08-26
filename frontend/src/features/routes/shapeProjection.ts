import type { Coordinates } from '../../types/journey';
import type { PatternStop } from '../../types/route';

/**
 * Placing a point *along the drawn line* rather than between two stops.
 *
 * A vehicle interpolated straight from one stop to the next cuts corners: it
 * leaves the road at every bend and, on a line that follows a bay or a ring
 * road, crosses ground the vehicle never touches. The shape is the road, so the
 * position has to be measured along it.
 *
 * The shape does not say which of its points are stops, so that has to be
 * worked out once: each stop is projected onto the polyline and remembered as a
 * distance from the start. After that, putting a vehicle four tenths of the way
 * from stop 6 to stop 7 is a lookup and a lerp.
 *
 * Distances are in **degree-space corrected for latitude**, not metres. Only
 * ratios along a line are ever read, so the unit cancels; what matters is that
 * a degree of longitude is narrower than a degree of latitude, and ignoring
 * that would slide a vehicle towards whichever end of a leg ran east-west.
 */

/** A shape with each vertex's running distance from the start. */
export interface ProjectedShape {
  points: Coordinates[];
  /** `cumulative[i]` is the distance from `points[0]` to `points[i]`. */
  cumulative: number[];
  /** Where each stop falls along it, keyed by the stop's `sequence`. */
  atStop: Map<number, number>;
}

/** Longitude compressed by latitude, so a diagonal is not measured as longer. */
export function distance(a: Coordinates, b: Coordinates): number {
  const meanLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dLat = b[0] - a[0];
  const dLon = (b[1] - a[1]) * Math.cos(meanLat);
  return Math.hypot(dLat, dLon);
}

/**
 * How far along the segment `a`→`b` the closest point to `p` lies, 0 to 1,
 * together with the squared distance to it.
 */
export function projectOnSegment(
  p: Coordinates,
  a: Coordinates,
  b: Coordinates,
): { t: number; gap: number } {
  const meanLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const scale = Math.cos(meanLat);

  const ax = a[1] * scale;
  const ay = a[0];
  const bx = b[1] * scale;
  const by = b[0];
  const px = p[1] * scale;
  const py = p[0];

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment — a feed can repeat a point — is its own answer.
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));

  const nx = ax + t * dx;
  const ny = ay + t * dy;
  return { t, gap: (px - nx) ** 2 + (py - ny) ** 2 };
}

/**
 * Measures a shape and pins every stop to a place on it.
 *
 * **The search walks forward and never back.** A loop route passes within
 * metres of a stop it called at twenty minutes earlier, so a nearest-point
 * search over the whole line would pin the second call to the first call's
 * place and send the vehicle back up the route. Starting each stop's search
 * where the previous one landed keeps the stops in the order the pattern
 * actually visits them, which is the order that matters.
 *
 * Null when there is no line to measure.
 */
export function projectShape(
  shape: Coordinates[],
  stops: PatternStop[],
): ProjectedShape | null {
  if (shape.length < 2) return null;

  const cumulative: number[] = [0];
  for (let index = 1; index < shape.length; index += 1) {
    cumulative.push(
      (cumulative[index - 1] as number) +
        distance(shape[index - 1] as Coordinates, shape[index] as Coordinates),
    );
  }

  const atStop = new Map<number, number>();
  let searchFrom = 0;

  for (const stop of stops) {
    const point: Coordinates = [stop.lat, stop.lon];
    let best = { segment: searchFrom, t: 0, gap: Infinity };

    for (let index = searchFrom; index < shape.length - 1; index += 1) {
      const projected = projectOnSegment(
        point,
        shape[index] as Coordinates,
        shape[index + 1] as Coordinates,
      );
      if (projected.gap < best.gap) best = { segment: index, t: projected.t, gap: projected.gap };
    }

    const start = cumulative[best.segment] as number;
    const end = cumulative[best.segment + 1] as number;
    atStop.set(stop.sequence, start + best.t * (end - start));
    searchFrom = best.segment;
  }

  return { points: shape, cumulative, atStop };
}

/** The coordinate a given distance along the shape, and the bearing there. */
export interface PointOnShape {
  point: Coordinates;
  /** Compass degrees, 0 north and 90 east — which way the vehicle is facing. */
  bearing: number;
}

/** Where `distance` along the shape lands, clamped to its two ends. */
export function pointAtDistance(shape: ProjectedShape, along: number): PointOnShape | null {
  const { points, cumulative } = shape;
  const total = cumulative[cumulative.length - 1] as number;
  if (points.length < 2) return null;

  const target = Math.max(0, Math.min(total, along));

  // Linear rather than binary: a pattern's shape is a few hundred points and
  // this runs a handful of times a tick.
  let index = 0;
  while (index < cumulative.length - 2 && (cumulative[index + 1] as number) < target) {
    index += 1;
  }

  const a = points[index] as Coordinates;
  const b = points[index + 1] as Coordinates;
  const start = cumulative[index] as number;
  const end = cumulative[index + 1] as number;
  const t = end === start ? 0 : (target - start) / (end - start);

  return {
    point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
    bearing: bearingBetween(a, b),
  };
}

/**
 * Where a vehicle between two stops sits on the drawn line.
 *
 * Falls back to a straight interpolation between the two stops when either is
 * not on the shape — a feed can carry a stop the geometry never reaches — so a
 * vehicle is drawn slightly off the road rather than not at all.
 */
export function pointBetweenStops(
  shape: ProjectedShape | null,
  from: PatternStop,
  to: PatternStop | null,
  fraction: number,
): PointOnShape | null {
  const target = to ?? from;

  if (shape !== null) {
    const start = shape.atStop.get(from.sequence);
    const end = shape.atStop.get(target.sequence);
    if (start !== undefined && end !== undefined) {
      const found = pointAtDistance(shape, start + fraction * (end - start));
      if (found !== null) {
        // Standing at a stop still needs a heading, and the leg it is about to
        // run is the honest one — a stopped vehicle faces the way it will go.
        return found;
      }
    }
  }

  const a: Coordinates = [from.lat, from.lon];
  const b: Coordinates = [target.lat, target.lon];
  return {
    point: [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])],
    bearing: bearingBetween(a, b),
  };
}

/** Compass bearing from one point to another, 0 north and 90 east. */
export function bearingBetween(a: Coordinates, b: Coordinates): number {
  const meanLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const east = (b[1] - a[1]) * Math.cos(meanLat);
  const north = b[0] - a[0];
  if (east === 0 && north === 0) return 0;
  return (Math.atan2(east, north) * (180 / Math.PI) + 360) % 360;
}
