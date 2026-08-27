import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLegVehicles } from './useLegVehicles';
import type { Journey, Stop, TransitLeg } from '../../types/journey';

/*
 * A leg names only the two stops a traveller boards and alights at, but the
 * vehicle's own trip runs further than that in both directions. The one
 * property worth pinning here is exactly that: a vehicle found on the map
 * before the traveller's own boarding stop and after their own alighting
 * stop, tracked over the trip's real pattern rather than clipped to the
 * leg's own record.
 *
 * The pattern, for every test below:
 *   A (seq 0, 10:00) — C (seq 1, 10:10) — mid (seq 2, 10:20)
 *     — D (seq 3, 10:30) — B (seq 4, 10:40)
 * The traveller rides from C to D; A and B are the trip's own two ends.
 */

const patternStop = (sequence: number, lat: number) => ({
  id: `s${sequence}`,
  name: `Stop ${sequence}`,
  code: null,
  platform: null,
  lat,
  lon: 0,
  description: null,
  fareZone: null,
  wheelchairAccessible: null,
  sequence,
  distanceFromOriginMeters: sequence * 1000,
});

const STOPS = [
  patternStop(0, 0),
  patternStop(1, 1),
  patternStop(2, 2),
  patternStop(3, 3),
  patternStop(4, 4),
];

const call = (time: string) => ({ date: '2026-09-10', time, arrivalDate: '2026-09-10', arrivalTime: time });

const TRIP = {
  tripId: 't1',
  serviceDate: '2026-09-10',
  headsign: null,
  calls: [call('10:00'), call('10:10'), call('10:20'), call('10:30'), call('10:40')],
};

const stop = (id: string, over: Partial<Stop> = {}): Stop => ({
  id,
  name: id,
  code: null,
  platform: null,
  lat: 0,
  lon: 0,
  ...over,
});

const LEG: TransitLeg = {
  mode: 'TRANSIT',
  waitDurationMinutes: 0,
  startDate: '2026-09-10',
  startTime: '10:10',
  endDate: '2026-09-10',
  endTime: '10:30',
  fromStop: stop('s1'),
  toStop: stop('s3'),
  shape: [],
  routeShortName: '1',
  routeType: 3,
  lineId: 'bus-1',
  patternId: 0,
  routeLongName: null,
  directionId: null,
  headsign: null,
  destination: null,
  intermediateStops: [],
  tripId: 't1',
  transitDurationMinutes: 20,
  transitDistanceMeters: null,
  walkDurationMinutes: null,
  walkDistanceMeters: null,
};

const JOURNEY: Journey = {
  startDate: '2026-09-10',
  startTime: '10:10',
  endDate: '2026-09-10',
  endTime: '10:30',
  totalDurationMinutes: 20,
  legs: [LEG],
};

/** 2026-09-10 at the given clock time, on `vehicleProgress.ts`'s own scale. */
const at = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const day = Math.round(Date.UTC(2026, 8, 10) / 86_400_000);
  return day * 86_400 + (h as number) * 3600 + (m as number) * 60;
};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/timetable')) {
        return new Response(
          JSON.stringify({
            lineId: 'bus-1',
            routeShortName: '1',
            routeType: 3,
            routeLongName: null,
            patternId: 0,
            directionId: null,
            headsign: null,
            date: '2026-09-10',
            stops: STOPS,
            stopCount: STOPS.length,
            trips: [TRIP],
            totalTrips: 1,
            outsideTimetableRange: false,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          lineId: 'bus-1',
          routeShortName: '1',
          routeType: 3,
          routeLongName: null,
          patternId: 0,
          directionId: null,
          headsign: null,
          originStopName: 'Stop 0',
          terminusStopName: 'Stop 4',
          stopCount: STOPS.length,
          tripCount: 1,
          firstDeparture: '10:00',
          lastDeparture: '10:00',
          serviceDates: ['2026-09-10'],
          stops: STOPS,
          shape: null,
        }),
        { status: 200 },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLegVehicles', () => {
  it('finds the vehicle before the traveller ever boards', async () => {
    stubFetch();
    const { result } = renderHook(() => useLegVehicles(JOURNEY, at('10:05')));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.leg).toBe(LEG);
  });

  /*
   * The traveller alights at s3 at 10:30. Standing there is still their
   * vehicle — it is the one they are stepping off — so it is the departure
   * that ends it, not the arrival.
   */
  it('is still there while it stands at the stop the traveller gets off at', async () => {
    stubFetch();
    const { result } = renderHook(() => useLegVehicles(JOURNEY, at('10:30')));

    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it('is gone once it has pulled away from where the traveller got off', async () => {
    stubFetch();
    const { result } = renderHook(() => useLegVehicles(JOURNEY, at('10:35')));

    /*
     * The trip itself runs on to s4 at 10:40 and `progressOf` still places it
     * — this is the leg's own end bounding the drawing, not the trip ending.
     */
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('is nowhere before the trip sets off from its own true origin', async () => {
    stubFetch();
    const { result } = renderHook(() => useLegVehicles(JOURNEY, at('09:55')));

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('is nowhere once the trip has finished its own true run', async () => {
    stubFetch();
    const { result } = renderHook(() => useLegVehicles(JOURNEY, at('10:45')));

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('is empty with no journey at all', () => {
    stubFetch();
    const { result } = renderHook(() => useLegVehicles(null, at('10:05')));
    expect(result.current).toEqual([]);
  });
});
