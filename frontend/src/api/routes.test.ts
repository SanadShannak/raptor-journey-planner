import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLine, getLineVariant, getLines, getVariantTimetable } from './routes';
import { isApiError } from './errors';

/*
 * The parsing and the query, not the request.
 *
 * Two rules here cannot be checked by eye and both cost real bugs if broken: a
 * hole in a trip's `calls` has to stay a hole, because the array is indexed by a
 * stop's position and dropping one shifts every stop after it; and `lineId` and
 * `patternId` are data in a path segment, so they have to be encoded.
 */

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const LINE = {
  lineId: 'tram-1',
  routeShortName: '1',
  routeType: 0,
  routeLongName: 'Eira - Käpylä',
};

const VARIANT = {
  patternId: 0,
  directionId: 0,
  headsign: 'Käpylä',
  originStopName: 'Telakkakatu',
  terminusStopName: 'Pohjolanaukio',
  stopCount: 3,
  tripCount: 450,
  firstDeparture: '05:37',
  lastDeparture: '21:09',
};

const stop = (sequence: number, over: Record<string, unknown> = {}) => ({
  id: `id-${sequence}`,
  name: `Stop ${sequence}`,
  code: `H000${sequence}`,
  lat: 60.17 + sequence / 1000,
  lon: 24.94,
  description: null,
  fareZone: 'A',
  platform: null,
  wheelchairAccessible: null,
  sequence,
  distanceFromOriginMeters: sequence * 400,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('getLines', () => {
  it('sends the query and the mode, and omits an empty query', async () => {
    const fetchMock = respondWith({ lines: [], totalLines: 0 });

    await getLines({ q: 'hameentie', mode: 0 });
    const withQuery = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(withQuery.pathname).toBe('/api/routes');
    expect(withQuery.searchParams.get('q')).toBe('hameentie');
    expect(withQuery.searchParams.get('mode')).toBe('0');

    await getLines({ q: '' });
    const bare = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(bare.searchParams.has('q')).toBe(false);
    expect(bare.searchParams.has('mode')).toBe(false);
  });

  it('reads a line, and keeps the directions that license a flip', async () => {
    respondWith({
      lines: [{ ...LINE, variantCount: 4, directions: [0, 1] }],
      totalLines: 1,
    });

    const { lines, totalLines } = await getLines();

    expect(totalLines).toBe(1);
    expect(lines[0]).toEqual({ ...LINE, variantCount: 4, directions: [0, 1] });
  });

  /* A feed without `direction_id` has no direction to offer, and none is
     invented — the client labels variants by their end points instead. */
  it('reads a missing direction list as no directions rather than both', async () => {
    respondWith({ lines: [{ ...LINE, variantCount: 1 }], totalLines: 1 });

    const { lines } = await getLines();

    expect(lines[0]?.directions).toEqual([]);
  });

  it('drops a line with no identity rather than heading it as undefined', async () => {
    respondWith({
      lines: [{ routeShortName: '1', routeType: 0 }, { ...LINE, variantCount: 1 }],
      totalLines: 2,
    });

    const { lines } = await getLines();

    expect(lines).toHaveLength(1);
    expect(lines[0]?.lineId).toBe('tram-1');
  });
});

describe('getLine', () => {
  it('encodes the line id, which is data in a path segment', async () => {
    const fetchMock = respondWith({ ...LINE, directions: [], variants: [] });

    await getLine('bus-4X/A');

    expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe(
      '/api/routes/bus-4X%2FA',
    );
  });

  it('reads the variants, and drops one with no pattern to ask for again', async () => {
    respondWith({
      ...LINE,
      directions: [0, 1],
      variants: [VARIANT, { directionId: 1, headsign: 'Eira' }],
    });

    const line = await getLine('tram-1');

    expect(line.variants).toHaveLength(1);
    expect(line.variants[0]).toEqual(VARIANT);
  });

  it('turns a 404 into an ApiError carrying the code', async () => {
    respondWith({ errorCode: 'LINE_NOT_FOUND', error: 'Line not found.' }, 404);

    await expect(getLine('bus-nope')).rejects.toSatisfy(
      (error: unknown) => isApiError(error) && error.code === 'LINE_NOT_FOUND',
    );
  });

  it('throws malformed when the body describes no line at all', async () => {
    respondWith({ variants: [] });

    await expect(getLine('tram-1')).rejects.toSatisfy(
      (error: unknown) => isApiError(error) && error.kind === 'malformed',
    );
  });
});

describe('getLineVariant', () => {
  it('reads the stops, the shape and the line’s own service days', async () => {
    respondWith({
      ...LINE,
      ...VARIANT,
      stops: [stop(0), stop(1, { platform: '51' }), stop(2)],
      stopCount: 3,
      shape: [
        [60.158, 24.934],
        [60.17, 24.938],
      ],
      serviceDates: ['2026-08-31', '2026-09-01'],
    });

    const variant = await getLineVariant('tram-1', 0);

    expect(variant.stops).toHaveLength(3);
    expect(variant.stops[1]?.platform).toBe('51');
    expect(variant.stops[2]?.distanceFromOriginMeters).toBe(800);
    expect(variant.shape).toHaveLength(2);
    expect(variant.serviceDates).toEqual(['2026-08-31', '2026-09-01']);
  });

  /* A feed without shapes.txt still has a line; null says "draw stop to stop",
     and so does a geometry too short to be a line. */
  it('reads an absent or one-point shape as no shape', async () => {
    respondWith({ ...LINE, ...VARIANT, stops: [], shape: null, serviceDates: [] });
    expect((await getLineVariant('tram-1', 0)).shape).toBeNull();

    respondWith({ ...LINE, ...VARIANT, stops: [], shape: [[60.1, 24.9]] });
    expect((await getLineVariant('tram-1', 0)).shape).toBeNull();
  });

  it('drops a stop that cannot be placed, and keeps the sequence of the rest', async () => {
    respondWith({
      ...LINE,
      ...VARIANT,
      stops: [stop(0), { ...stop(1), lat: null }, stop(2)],
      stopCount: 3,
    });

    const variant = await getLineVariant('tram-1', 0);

    expect(variant.stops.map((entry) => entry.sequence)).toEqual([0, 2]);
    // The pattern is still three stops long; the list is what has the hole.
    expect(variant.stopCount).toBe(3);
  });
});

describe('getVariantTimetable', () => {
  const trip = (times: (string | null)[], tripId = 'trip-1') => ({
    tripId,
    headsign: 'Käpylä',
    calls: times.map((time) =>
      time === null
        ? null
        : { date: '2026-09-10', time, arrivalDate: '2026-09-10', arrivalTime: time },
    ),
  });

  it('sends the date and encodes both path segments', async () => {
    const fetchMock = respondWith({ ...LINE, ...VARIANT, stops: [], trips: [] });

    await getVariantTimetable('tram-4T', 51, '2026-09-10');

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/routes/tram-4T/51/timetable');
    expect(url.searchParams.get('date')).toBe('2026-09-10');
  });

  /*
   * The rule that costs a real bug if broken. `calls` is indexed by a stop's
   * position in the pattern, so a trip that skips a stop must keep a hole
   * there — compacting it would move every later stop onto the wrong row.
   */
  it('keeps a hole in a trip as a hole', async () => {
    respondWith({
      ...LINE,
      ...VARIANT,
      stops: [stop(0), stop(1), stop(2)],
      stopCount: 3,
      trips: [trip(['05:37', null, '05:49'])],
      totalTrips: 1,
    });

    const timetable = await getVariantTimetable('tram-1', 0, '2026-09-10');

    expect(timetable.trips[0]?.calls).toHaveLength(3);
    expect(timetable.trips[0]?.calls[1]).toBeNull();
    expect(timetable.trips[0]?.calls[2]?.time).toBe('05:49');
  });

  it('pads a short trip out to the pattern’s length', async () => {
    respondWith({
      ...LINE,
      ...VARIANT,
      stops: [stop(0), stop(1), stop(2)],
      stopCount: 3,
      trips: [trip(['05:37'])],
    });

    const timetable = await getVariantTimetable('tram-1', 0, '2026-09-10');

    expect(timetable.trips[0]?.calls).toEqual([
      { date: '2026-09-10', time: '05:37', arrivalDate: '2026-09-10', arrivalTime: '05:37' },
      null,
      null,
    ]);
  });

  it('drops a trip with no readable call at all', async () => {
    respondWith({
      ...LINE,
      ...VARIANT,
      stops: [stop(0), stop(1)],
      stopCount: 2,
      trips: [trip([null, null], 'ghost'), trip(['05:37', '05:44'])],
      totalTrips: 2,
    });

    const timetable = await getVariantTimetable('tram-1', 0, '2026-09-10');

    expect(timetable.trips).toHaveLength(1);
    expect(timetable.trips[0]?.tripId).toBe('trip-1');
    // `totalTrips` is the backend's own count and is not recomputed from a
    // filtered list — it says what the day holds, not what parsed.
    expect(timetable.totalTrips).toBe(2);
  });

  it('reads a call’s arrival separately from its departure', async () => {
    respondWith({
      ...LINE,
      ...VARIANT,
      stops: [stop(0)],
      stopCount: 1,
      trips: [
        {
          tripId: 'trip-1',
          headsign: null,
          calls: [
            {
              date: '2026-09-10',
              time: '05:29',
              arrivalDate: '2026-09-10',
              arrivalTime: '05:28',
            },
          ],
        },
      ],
    });

    const timetable = await getVariantTimetable('tram-1', 0, '2026-09-10');

    expect(timetable.trips[0]?.calls[0]?.arrivalTime).toBe('05:28');
    expect(timetable.trips[0]?.calls[0]?.time).toBe('05:29');
  });

  /* A date outside the feed's window is an empty board, not a failure. */
  it('reads the outside-the-window flag', async () => {
    respondWith({
      ...LINE,
      ...VARIANT,
      stops: [],
      trips: [],
      totalTrips: 0,
      outsideTimetableRange: true,
    });

    const timetable = await getVariantTimetable('tram-1', 0, '2027-01-05');

    expect(timetable.outsideTimetableRange).toBe(true);
    expect(timetable.trips).toEqual([]);
  });

  it('turns a bad date into an ApiError carrying the code', async () => {
    respondWith({ errorCode: 'BAD_DATE', error: 'Missing or invalid date.' }, 400);

    await expect(getVariantTimetable('tram-1', 0, 'nope')).rejects.toSatisfy(
      (error: unknown) => isApiError(error) && error.code === 'BAD_DATE',
    );
  });
});
