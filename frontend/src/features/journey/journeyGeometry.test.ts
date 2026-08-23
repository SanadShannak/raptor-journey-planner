import { describe, expect, it } from 'vitest';
import { boxFromGeoBounds, journeyGeometry } from './journeyGeometry';
import type {
  Coordinates,
  Journey,
  IntermediateStop,
  Stop,
  TransitLeg,
  WalkLeg,
} from '../../types/journey';

/*
 * What is worth testing here is the reading of the API, not the drawing. The
 * response carries coordinates in three different shapes, a walk is always a
 * straight line while a ride may not be, and a bounding box has to fold over
 * every point that actually gets drawn — including the two ends, which are not
 * in any `shape`. None of that is checkable by eye in a component.
 */

const stop = (name: string, lat: number, lon: number): Stop => ({
  id: '1',
  name,
  code: null,
  platform: null,
  lat,
  lon,
});

const pin = (name: 'ORIGIN' | 'TARGET', lat: number, lon: number): Stop => ({
  id: null,
  name,
  code: name === 'ORIGIN' ? 'ORIGIN_PIN' : 'TARGET_PIN',
  platform: null,
  lat,
  lon,
});

/** The third coordinate shape: `stopLat` / `stopLon`, not `lat` / `lon`. */
const passing = (name: string, lat: number, lon: number): IntermediateStop => ({
  stopId: '9',
  stopName: name,
  stopCode: null,
  stopLat: lat,
  stopLon: lon,
  stopArrivalTime: '18:10',
});

function walk(from: Stop, to: Stop, shape?: Coordinates[]): WalkLeg {
  return {
    mode: 'WALK',
    waitDurationMinutes: 0,
    startDate: '2026-08-24',
    startTime: '18:00',
    endDate: '2026-08-24',
    endTime: '18:05',
    fromStop: from,
    toStop: to,
    // A walk is always exactly two points: the engine measures it as the crow
    // flies, which is why the map dashes it.
    shape: shape ?? [
      [from.lat, from.lon],
      [to.lat, to.lon],
    ],
    walkDurationMinutes: 5,
    walkDistanceMeters: 300,
    routeShortName: null,
    routeType: null,
    lineId: null,
    routeLongName: null,
    directionId: null,
    headsign: null,
    destination: null,
    intermediateStops: null,
    tripId: null,
    transitDurationMinutes: null,
    transitDistanceMeters: null,
  };
}

function ride(
  from: Stop,
  to: Stop,
  routeType: number,
  shape: Coordinates[],
  intermediateStops: IntermediateStop[] = [],
): TransitLeg {
  return {
    mode: 'TRANSIT',
    waitDurationMinutes: 0,
    startDate: '2026-08-24',
    startTime: '18:05',
    endDate: '2026-08-24',
    endTime: '18:20',
    fromStop: from,
    toStop: to,
    shape,
    routeShortName: '55',
    routeType: routeType as TransitLeg['routeType'],
    lineId: 'bus-55',
    routeLongName: null,
    directionId: null,
    headsign: null,
    destination: null,
    intermediateStops,
    tripId: 't',
    transitDurationMinutes: 15,
    transitDistanceMeters: 2000,
    walkDurationMinutes: null,
    walkDistanceMeters: null,
  };
}

const journeyOf = (legs: Journey['legs']): Journey => ({
  startDate: '2026-08-24',
  startTime: legs[0]?.startTime ?? '18:00',
  endDate: '2026-08-24',
  endTime: legs[legs.length - 1]?.endTime ?? '19:00',
  totalDurationMinutes: 60,
  legs,
});

describe('journeyGeometry segments', () => {
  it('marks a walk as a walk and a ride by its family', () => {
    const kamppi = stop('Kamppi', 60.169, 24.931);
    const kallio = stop('Kallio', 60.184, 24.955);

    const { segments } = journeyGeometry(
      journeyOf([
        walk(pin('ORIGIN', 60.168, 24.93), kamppi),
        // routeType 2 is rail, which the visuals call "train".
        ride(kamppi, kallio, 2, [
          [60.169, 24.931],
          [60.176, 24.94],
          [60.184, 24.955],
        ]),
      ]),
    );

    expect(segments.map((s) => [s.kind, s.family])).toEqual([
      ['walk', null],
      ['transit', 'train'],
    ]);
    // The ride keeps every point of its real polyline.
    expect(segments[1]?.path).toHaveLength(3);
  });

  /* The join key for sidebar-to-map highlighting. */
  it('carries the index of the leg each segment came from', () => {
    const a = stop('A', 60.1, 24.9);
    const b = stop('B', 60.2, 25.0);

    const { segments } = journeyGeometry(
      journeyOf([walk(pin('ORIGIN', 60.0, 24.8), a), ride(a, b, 3, [[60.1, 24.9], [60.2, 25.0]]), walk(b, pin('TARGET', 60.3, 25.1))]),
    );

    expect(segments.map((s) => s.legIndex)).toEqual([0, 1, 2]);
    expect(new Set(segments.map((s) => s.key)).size).toBe(3);
  });

  /*
   * The contract promises two points, so this is defensive rather than
   * expected — but a broken response should draw a straight line between the
   * leg's own stops rather than leave a gap in the journey.
   */
  it('falls back to the leg’s two stops when the shape is unusable', () => {
    const a = stop('A', 60.1, 24.9);
    const b = stop('B', 60.2, 25.0);

    const { segments } = journeyGeometry(journeyOf([walk(a, b, [])]));

    expect(segments[0]?.path).toEqual([
      [60.1, 24.9],
      [60.2, 25.0],
    ]);
  });

  it('drops a segment that cannot be drawn at all', () => {
    const nowhere: Stop = { ...stop('A', 60.1, 24.9), lat: NaN, lon: NaN };
    const { segments, bounds } = journeyGeometry(journeyOf([walk(nowhere, nowhere, [])]));

    expect(segments).toEqual([]);
    expect(bounds).toBeNull();
  });
});

describe('journeyGeometry stops', () => {
  it('marks where you get on and off, and what you ride through', () => {
    const kamppi = stop('Kamppi', 60.169, 24.931);
    const kallio = stop('Kallio', 60.184, 24.955);

    const { calls, passed } = journeyGeometry(
      journeyOf([
        ride(kamppi, kallio, 3, [[60.169, 24.931], [60.184, 24.955]], [
          passing('Hakaniemi', 60.178, 24.949),
        ]),
      ]),
    );

    expect(calls.map((c) => [c.role, c.name])).toEqual([
      ['board', 'Kamppi'],
      ['alight', 'Kallio'],
    ]);
    // Read off `stopLat` / `stopLon`, which is a different shape again.
    expect(passed.map((p) => [p.name, p.point])).toEqual([
      ['Hakaniemi', [60.178, 24.949]],
    ]);
  });

  // A walk's ends are either a pin or the stop of a ride that already marks it.
  it('puts no markers on a walk', () => {
    const { calls, passed } = journeyGeometry(
      journeyOf([walk(pin('ORIGIN', 60.1, 24.9), pin('TARGET', 60.2, 25.0))]),
    );

    expect(calls).toEqual([]);
    expect(passed).toEqual([]);
  });

  it('reports the traveller’s own two ends', () => {
    const { origin, destination } = journeyGeometry(
      journeyOf([
        walk(pin('ORIGIN', 60.15, 24.92), stop('A', 60.169, 24.931)),
        ride(stop('A', 60.169, 24.931), stop('B', 60.2, 25.0), 3, [[60.169, 24.931], [60.2, 25.0]]),
        walk(stop('B', 60.2, 25.0), pin('TARGET', 60.21, 25.02)),
      ]),
    );

    expect(origin).toEqual([60.15, 24.92]);
    expect(destination).toEqual([60.21, 25.02]);
  });

  it('has no ends to report for a journey with no legs', () => {
    const geometry = journeyGeometry(journeyOf([]));

    expect(geometry.origin).toBeNull();
    expect(geometry.destination).toBeNull();
    expect(geometry.bounds).toBeNull();
    expect(geometry.segments).toEqual([]);
  });
});

describe('journeyGeometry bounds', () => {
  /*
   * The box has to cover the ends as well as the lines. A dropped pin is not in
   * any `shape`, so folding only the shapes would frame a journey with its own
   * starting point off the screen.
   */
  it('covers the pins as well as the drawn lines', () => {
    const { bounds } = journeyGeometry(
      journeyOf([
        walk(pin('ORIGIN', 60.0, 24.0), stop('A', 60.5, 24.5)),
        ride(stop('A', 60.5, 24.5), stop('B', 60.6, 24.6), 3, [[60.5, 24.5], [60.6, 24.6]]),
        walk(stop('B', 60.6, 24.6), pin('TARGET', 61.0, 25.0)),
      ]),
    );

    expect(bounds).toEqual([
      [60.0, 24.0],
      [61.0, 25.0],
    ]);
  });

  /*
   * A journey that collapses to a single point gives a zero-size box. Leaflet
   * would then compute an infinite scale and slam to its maximum zoom, so the
   * caller caps it — but the box itself is still reported honestly.
   */
  it('reports a zero-size box rather than pretending', () => {
    const here = stop('Here', 60.17, 24.94);
    const { bounds } = journeyGeometry(journeyOf([walk(here, here)]));

    expect(bounds).toEqual([
      [60.17, 24.94],
      [60.17, 24.94],
    ]);
  });

  it('turns a network’s search area into the same shape', () => {
    expect(
      boxFromGeoBounds({ minLat: 59.9, minLon: 24.0, maxLat: 60.9, maxLon: 25.7 }),
    ).toEqual([
      [59.9, 24.0],
      [60.9, 25.7],
    ]);
  });
});
