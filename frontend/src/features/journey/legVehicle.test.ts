import { describe, expect, it } from 'vitest';
import { legVehiclePosition } from './legVehicle';
import type { IntermediateStop, Stop, TransitLeg } from '../../types/journey';

/*
 * Where a ridden leg's own vehicle is, worked out from the leg alone.
 *
 * The cases worth pinning: nowhere before it sets off or after it finishes,
 * standing at the moment it calls somewhere, running between two calls, a
 * straight line drawn along the shape rather than cut across it, the
 * midnight-crossing date inference, and the straight-line fallback when there
 * is no shape to measure along.
 */

const stop = (lat: number, lon: number, over: Partial<Stop> = {}): Stop => ({
  id: 's',
  name: 'Stop',
  code: null,
  platform: null,
  lat,
  lon,
  ...over,
});

const call = (
  lat: number,
  lon: number,
  time: string,
  over: Partial<IntermediateStop> = {},
): IntermediateStop => ({
  stopId: 'i',
  stopName: 'Intermediate',
  stopCode: null,
  stopLat: lat,
  stopLon: lon,
  stopArrivalTime: time,
  ...over,
});

/** A leg running due east along the equator, so distance is easy to reason about. */
function leg(over: Partial<TransitLeg> = {}): TransitLeg {
  return {
    mode: 'TRANSIT',
    waitDurationMinutes: 0,
    startDate: '2026-09-10',
    startTime: '10:00',
    endDate: '2026-09-10',
    endTime: '10:20',
    fromStop: stop(0, 0),
    toStop: stop(0, 2),
    shape: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    routeShortName: '1',
    routeType: 3,
    lineId: 'bus-1',
    patternId: 0,
    routeLongName: null,
    directionId: null,
    headsign: null,
    destination: null,
    intermediateStops: [call(0, 1, '10:10')],
    tripId: 't1',
    transitDurationMinutes: 20,
    transitDistanceMeters: null,
    walkDurationMinutes: null,
    walkDistanceMeters: null,
    ...over,
  };
}

/** Seconds from a `2026-09-10` clock time, on the same scale as the module. */
const at = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const DAY_2026_09_10 = Math.round(Date.UTC(2026, 8, 10) / 86_400_000);
  return DAY_2026_09_10 * 86_400 + (h as number) * 3600 + (m as number) * 60;
};

describe('legVehiclePosition', () => {
  it('is nowhere before it sets off and after it finishes', () => {
    const run = leg();
    expect(legVehiclePosition(run, at('09:59'))).toBeNull();
    expect(legVehiclePosition(run, at('10:21'))).toBeNull();
  });

  it('stands at the origin at the moment it departs', () => {
    const found = legVehiclePosition(leg(), at('10:00'));
    expect(found?.point).toEqual([0, 0]);
  });

  it('is halfway along by the halfway call', () => {
    const found = legVehiclePosition(leg(), at('10:10'));
    expect(found?.point[1]).toBeCloseTo(1, 5);
  });

  it('interpolates evenly between two calls', () => {
    // A quarter of the way in time from departure (10:00) to the intermediate
    // (10:10) — 150 of the 600 seconds between them — should be a quarter of
    // the way there in space too, since the shape between them is straight.
    const quarter = legVehiclePosition(leg(), at('10:00') + 150);
    expect(quarter?.point[1]).toBeCloseTo(0.25, 5);
  });

  it('is at the last stop at the moment it arrives', () => {
    const found = legVehiclePosition(leg(), at('10:20'));
    expect(found?.point).toEqual([0, 2]);
  });

  /*
   * A leg whose intermediate call reads earlier on the clock than the one
   * before it crossed midnight — everything from there on belongs to the
   * leg's own `endDate`, not its `startDate`.
   */
  it('infers the following date once a call reads earlier than the one before it', () => {
    const overnight = leg({
      startDate: '2026-09-10',
      startTime: '23:50',
      endDate: '2026-09-11',
      endTime: '00:10',
      intermediateStops: [call(0, 1, '00:00')],
    });

    // Before midnight: nowhere near the far end yet.
    const before = legVehiclePosition(overnight, at('23:55'));
    expect(before?.point[1]).toBeLessThan(1);

    // Just after midnight the *next* day — not still "23:5x" on the 10th,
    // which a naive same-day reading would have this land on instead.
    const DAY_11 = Math.round(Date.UTC(2026, 8, 11) / 86_400_000);
    const justAfterMidnight = DAY_11 * 86_400 + 2 * 60; // 00:02 on the 11th
    const after = legVehiclePosition(overnight, justAfterMidnight);
    expect(after?.point[1]).toBeGreaterThan(1);
  });

  it('falls back to a straight line when the leg carries no usable shape', () => {
    const noShape = leg({ shape: [] });
    const found = legVehiclePosition(noShape, at('10:10'));
    expect(found?.point[1]).toBeCloseTo(1, 5);
  });

  it('follows the shape rather than cutting the corner it makes', () => {
    // A shape that bows north between the two ends: at the midpoint in time,
    // a vehicle on the shape is north of the straight line between the ends.
    const bowed = leg({
      fromStop: stop(0, 0),
      toStop: stop(0, 2),
      shape: [
        [0, 0],
        [1, 1],
        [0, 2],
      ],
      intermediateStops: [],
      endTime: '10:20',
    });

    const found = legVehiclePosition(bowed, at('10:10'));
    expect(found?.point[0]).toBeGreaterThan(0);
  });
});
