import type { Coordinates, Journey, JourneyLeg } from '../../types/journey';
import type { GeoBounds } from '../../config/geocoding';
import { familyFor } from './modeVisuals';

/**
 * A journey rewritten as the things a map draws.
 *
 * The same division of labour as `itineraryRows.ts`: the awkward reading of the
 * API happens here, in a pure function with tests, and the component that draws
 * it stays a matter of wiring. Nothing in this file imports Leaflet — it is
 * ordinary arithmetic over numbers, and it runs in a test environment that has
 * no layout at all.
 *
 * Three separate reconciliations happen here so that nothing downstream has to
 * know about them:
 *
 * 1. **Coordinates come in three shapes.** `fromStop` and `toStop` carry `lat`
 *    and `lon`; `intermediateStops` carry `stopLat` and `stopLon`; `shape` is a
 *    bare `[lat, lon]` tuple. Only the tuple is what a map wants.
 * 2. **A leg may have no usable shape.** The contract says there are always at
 *    least two points, but a defensive fall back to the leg's own two stops
 *    costs one line and turns a broken response into a straight line rather
 *    than a gap.
 * 3. **A walk is always a straight line of exactly two points.** The engine
 *    measures footpaths as the crow flies (README, "Unrealistic Footpath
 *    Routing"), so on a map they cut across water and buildings. That is not
 *    something to hide: `kind` carries it out to the drawing, which dashes
 *    them, the same way the strip map already does.
 *
 * Longitudes are taken at face value. A journey spanning the antimeridian would
 * produce a bounding box the wrong way round, which is not a case either
 * network this app targets can produce.
 */

/** `[latitude, longitude]` — the API's order, and Leaflet's. */
export type Point = Coordinates;

/** South-west corner then north-east: the pair `fitBounds` takes. */
export type BoundingBox = [southWest: Point, northEast: Point];

export interface MapSegment {
  key: string;
  /** Index into `journey.legs`, so a hovered row can find its own line. */
  legIndex: number;
  kind: 'walk' | 'transit';
  /**
   * The visual family — `bus`, `tram`, … — rather than the raw route type, for
   * the same reason `Spine` carries one: a drawn line knows it is "a tram" and
   * has no reason to remember it was `route_type` 0. Null on a walk.
   */
  family: string | null;
  path: Point[];
  /**
   * Halfway along the drawn line, by length rather than by index.
   *
   * Where the badge naming this leg sits. Taking the middle *entry* of the
   * array would put it wherever the shape happens to be densest — around a
   * curve, typically, because that is where a feed records more points — and a
   * badge parked on a bend at one end of a long straight reads as belonging to
   * the wrong stretch of line.
   */
  midpoint: Point | null;
}

/**
 * What a stop is to this journey.
 *
 * `board` and `alight` are the moments you get on and off, and are worth a
 * marker. `passed` is a stop the vehicle calls at while you stay on it — real
 * information, but not a decision, so it is drawn smaller or not at all.
 */
export type StopRole = 'origin' | 'destination' | 'board' | 'alight' | 'passed';

export interface MapStop {
  key: string;
  legIndex: number;
  role: StopRole;
  point: Point;
  name: string;
  family: string | null;
}

export interface JourneyGeometry {
  segments: MapSegment[];
  /** The traveller's own two ends, which are pins rather than stops. */
  origin: Point | null;
  destination: Point | null;
  /** Where you get on and off. */
  calls: MapStop[];
  /** Ridden through without getting off. */
  passed: MapStop[];
  /** Null when the journey yielded no drawable point at all. */
  bounds: BoundingBox | null;
}

const isPoint = (value: unknown): value is Point =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]);

/** A leg's drawn path, falling back to its two stops if the shape is unusable. */
function pathFor(leg: JourneyLeg): Point[] {
  const shape = leg.shape.filter(isPoint);
  if (shape.length >= 2) return shape;

  const ends: Point[] = [
    [leg.fromStop.lat, leg.fromStop.lon],
    [leg.toStop.lat, leg.toStop.lon],
  ];
  return ends.filter(isPoint);
}

/**
 * The point halfway along a path, measured by distance travelled.
 *
 * Longitude degrees narrow towards the poles, so they are scaled by latitude
 * before lengths are compared. Without that, a north-south leg measures far
 * longer than an equally long east-west one and the halfway mark sits
 * off-centre. Plain trigonometry over a city is close enough: this chooses
 * where to put a badge, it does not measure a distance anyone reads.
 */
function midpointOf(path: Point[]): Point | null {
  const first = path[0];
  if (first === undefined) return null;
  if (path.length === 1) return first;

  const spans: number[] = [];
  let total = 0;

  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    if (from === undefined || to === undefined) continue;

    const dLat = to[0] - from[0];
    const dLon = (to[1] - from[1]) * Math.cos((from[0] * Math.PI) / 180);
    const span = Math.hypot(dLat, dLon);
    spans.push(span);
    total += span;
  }

  // Every point in the same place: the middle of it is that place.
  if (total === 0) return first;

  let remaining = total / 2;
  for (const [index, span] of spans.entries()) {
    if (remaining <= span) {
      const from = path[index];
      const to = path[index + 1];
      if (from === undefined || to === undefined) break;
      const ratio = span === 0 ? 0 : remaining / span;
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    }
    remaining -= span;
  }

  return path[path.length - 1] ?? first;
}

/** Folds every drawn point into one box. */
function boxOf(points: Point[]): BoundingBox | null {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;

  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

export function journeyGeometry(journey: Journey): JourneyGeometry {
  const segments: MapSegment[] = [];
  const calls: MapStop[] = [];
  const passed: MapStop[] = [];
  const drawn: Point[] = [];

  const lastIndex = journey.legs.length - 1;

  journey.legs.forEach((leg, legIndex) => {
    const path = pathFor(leg);
    const transit = leg.mode === 'TRANSIT';
    const family = transit ? familyFor(leg.routeType) : null;

    if (path.length >= 2) {
      segments.push({
        key: `${leg.mode === 'WALK' ? 'walk' : 'transit'}-${legIndex}`,
        legIndex,
        kind: transit ? 'transit' : 'walk',
        family,
        path,
        midpoint: midpointOf(path),
      });
      drawn.push(...path);
    }

    /*
     * Only a ridden leg gets boarding and alighting markers. The ends of a walk
     * are either a pin, which is drawn as one of the journey's two ends, or the
     * stop of the ride either side of it — which that ride already marks.
     */
    if (transit) {
      const board: Point = [leg.fromStop.lat, leg.fromStop.lon];
      const alight: Point = [leg.toStop.lat, leg.toStop.lon];

      if (isPoint(board)) {
        calls.push({
          key: `board-${legIndex}`,
          legIndex,
          role: 'board',
          point: board,
          name: leg.fromStop.name,
          family,
        });
        drawn.push(board);
      }
      if (isPoint(alight)) {
        calls.push({
          key: `alight-${legIndex}`,
          legIndex,
          role: 'alight',
          point: alight,
          name: leg.toStop.name,
          family,
        });
        drawn.push(alight);
      }

      // A different shape again: `stopLat` / `stopLon`, not `lat` / `lon`.
      for (const [order, stop] of (leg.intermediateStops ?? []).entries()) {
        const point: Point = [stop.stopLat, stop.stopLon];
        if (!isPoint(point)) continue;
        passed.push({
          key: `passed-${legIndex}-${order}`,
          legIndex,
          role: 'passed',
          point,
          name: stop.stopName,
          family,
        });
        drawn.push(point);
      }
    }

    if (legIndex === 0) {
      const start: Point = [leg.fromStop.lat, leg.fromStop.lon];
      if (isPoint(start)) drawn.push(start);
    }
    if (legIndex === lastIndex) {
      const end: Point = [leg.toStop.lat, leg.toStop.lon];
      if (isPoint(end)) drawn.push(end);
    }
  });

  const first = journey.legs[0];
  const last = journey.legs[lastIndex];
  const origin: Point | null = first ? [first.fromStop.lat, first.fromStop.lon] : null;
  const destination: Point | null = last ? [last.toStop.lat, last.toStop.lon] : null;

  return {
    segments,
    origin: origin !== null && isPoint(origin) ? origin : null,
    destination: destination !== null && isPoint(destination) ? destination : null,
    calls,
    passed,
    bounds: boxOf(drawn),
  };
}

/** The network's search area as something `fitBounds` takes, for the empty state. */
export function boxFromGeoBounds(bounds: GeoBounds): BoundingBox {
  return [
    [bounds.minLat, bounds.minLon],
    [bounds.maxLat, bounds.maxLon],
  ];
}
