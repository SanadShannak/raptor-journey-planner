import { describe, expect, it } from 'vitest';
import {
  bearingBetween,
  pointAtDistance,
  pointBetweenStops,
  projectShape,
} from './shapeProjection';
import type { Coordinates } from '../../types/journey';
import type { PatternStop } from '../../types/route';

const stop = (sequence: number, lat: number, lon: number): PatternStop => ({
  id: `id-${sequence}`,
  name: `Stop ${sequence}`,
  code: null,
  platform: null,
  lat,
  lon,
  description: null,
  fareZone: null,
  wheelchairAccessible: null,
  sequence,
  distanceFromOriginMeters: null,
});

/** A line due north, then a right-angle turn due east. */
const ELBOW: Coordinates[] = [
  [60.0, 24.0],
  [60.1, 24.0],
  [60.1, 24.2],
];

describe('projectShape', () => {
  it('pins each stop to its place along the line', () => {
    const stops = [stop(0, 60.0, 24.0), stop(1, 60.1, 24.0), stop(2, 60.1, 24.2)];
    const projected = projectShape(ELBOW, stops)!;

    expect(projected.atStop.get(0)).toBeCloseTo(0, 6);
    expect(projected.atStop.get(2)).toBeCloseTo(
      projected.cumulative[projected.cumulative.length - 1]!,
      6,
    );
    // The corner is partway along, and before the end.
    expect(projected.atStop.get(1)!).toBeGreaterThan(0);
    expect(projected.atStop.get(1)!).toBeLessThan(projected.atStop.get(2)!);
  });

  it('pins a stop that sits a little off the line to the nearest point on it', () => {
    const projected = projectShape(ELBOW, [stop(0, 60.05, 24.001)])!;

    // Halfway up the northbound leg, whose length is 0.1 degrees of latitude.
    expect(projected.atStop.get(0)).toBeCloseTo(0.05, 3);
  });

  /*
   * The reason the search only ever walks forward. A loop passes within metres
   * of a stop it called at earlier, and a nearest-point search over the whole
   * line pins the second call to the first one's place — which sends a vehicle
   * back up the route it has already run.
   */
  it('keeps a loop’s second call at a stop ahead of its first', () => {
    const loop: Coordinates[] = [
      [60.0, 24.0],
      [60.1, 24.0],
      [60.1, 24.1],
      [60.0, 24.1],
      [60.0, 24.0],
    ];
    // Out to the far corner and back to where it started.
    const stops = [stop(0, 60.0, 24.0), stop(1, 60.1, 24.1), stop(2, 60.0, 24.0)];

    const projected = projectShape(loop, stops)!;

    expect(projected.atStop.get(0)).toBeCloseTo(0, 6);
    expect(projected.atStop.get(2)!).toBeGreaterThan(projected.atStop.get(1)!);
  });

  it('has nothing to measure without a line', () => {
    expect(projectShape([], [])).toBeNull();
    expect(projectShape([[60, 24]], [])).toBeNull();
  });
});

describe('pointAtDistance', () => {
  it('walks the line rather than the straight line between its ends', () => {
    const projected = projectShape(ELBOW, [])!;
    const total = projected.cumulative[projected.cumulative.length - 1]!;

    const corner = pointAtDistance(projected, projected.cumulative[1]!)!;
    expect(corner.point[0]).toBeCloseTo(60.1, 6);
    expect(corner.point[1]).toBeCloseTo(24.0, 6);

    // Past the corner the line runs east, so the latitude stops changing.
    const beyond = pointAtDistance(projected, total)!;
    expect(beyond.point[0]).toBeCloseTo(60.1, 6);
    expect(beyond.point[1]).toBeCloseTo(24.2, 6);
  });

  it('clamps to the ends rather than running off them', () => {
    const projected = projectShape(ELBOW, [])!;

    expect(pointAtDistance(projected, -5)!.point).toEqual([60.0, 24.0]);
    expect(pointAtDistance(projected, 999)!.point[1]).toBeCloseTo(24.2, 6);
  });
});

describe('pointBetweenStops', () => {
  const stops = [stop(0, 60.0, 24.0), stop(1, 60.1, 24.0), stop(2, 60.1, 24.2)];

  it('follows the shape around a corner instead of cutting it', () => {
    const projected = projectShape(ELBOW, stops)!;

    // Halfway from the first stop to the last, by distance along the line.
    const half = pointBetweenStops(projected, stops[0]!, stops[2]!, 0.5)!;

    // A straight cut would put it inside the elbow, well east of the meridian
    // and south of the corner. On the line it is still on one of the two legs.
    const onNorthLeg = Math.abs(half.point[1] - 24.0) < 1e-6;
    const onEastLeg = Math.abs(half.point[0] - 60.1) < 1e-6;
    expect(onNorthLeg || onEastLeg).toBe(true);
  });

  /* A feed can carry a stop the geometry never reaches. Slightly off the road
     beats not drawn at all. */
  it('falls back to a straight line when the shape cannot place a stop', () => {
    const orphan = stop(9, 60.05, 24.05);
    const straight = pointBetweenStops(null, stops[0]!, orphan, 0.5)!;

    expect(straight.point[0]).toBeCloseTo(60.025, 6);
    expect(straight.point[1]).toBeCloseTo(24.025, 6);
  });

  /* A stopped vehicle still faces the way it is about to go. */
  it('gives a standing vehicle the heading of the leg it will run', () => {
    const projected = projectShape(ELBOW, stops)!;
    const standing = pointBetweenStops(projected, stops[0]!, null, 0)!;

    expect(standing.point[0]).toBeCloseTo(60.0, 6);
    expect(Number.isFinite(standing.bearing)).toBe(true);
  });
});

describe('bearingBetween', () => {
  it('reads north as 0 and east as 90', () => {
    expect(bearingBetween([60, 24], [60.1, 24])).toBeCloseTo(0, 3);
    expect(bearingBetween([60, 24], [60, 24.1])).toBeCloseTo(90, 3);
    expect(bearingBetween([60, 24], [59.9, 24])).toBeCloseTo(180, 3);
    expect(bearingBetween([60, 24], [60, 23.9])).toBeCloseTo(270, 3);
  });

  it('answers north for a point on top of itself rather than NaN', () => {
    expect(bearingBetween([60, 24], [60, 24])).toBe(0);
  });
});
