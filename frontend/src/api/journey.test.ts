import { afterEach, describe, expect, it, vi } from 'vitest';
import { getValidDates, planJourney } from './journey';
import { ApiError } from './errors';
import type { JourneyQuery } from '../types/journey';

function mockJson(value: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  return new URL(fetchMock.mock.calls[0]![0] as string);
}

const baseQuery: JourneyQuery = {
  origin: { type: 'coordinate', lat: 60.2, lon: 24.9 },
  destination: { type: 'coordinate', lat: 60.1, lon: 24.98 },
  date: '2026-09-13',
  time: '18:00:00',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('planJourney', () => {
  it('sends coordinate endpoints as lat/lon pairs', async () => {
    const fetchMock = mockJson({ legs: [] });

    await planJourney(baseQuery);

    const params = requestedUrl(fetchMock).searchParams;
    expect(params.get('originLat')).toBe('60.2');
    expect(params.get('originLon')).toBe('24.9');
    expect(params.get('destLat')).toBe('60.1');
    expect(params.get('destLon')).toBe('24.98');
    expect(params.get('date')).toBe('2026-09-13');
    expect(params.get('time')).toBe('18:00:00');
  });

  it('sends stop endpoints as stop ids', async () => {
    const fetchMock = mockJson({ legs: [] });

    await planJourney({
      ...baseQuery,
      origin: { type: 'stop', stopId: 'H0326' },
      destination: { type: 'stop', stopId: 'H0099' },
    });

    const params = requestedUrl(fetchMock).searchParams;
    expect(params.get('originStopId')).toBe('H0326');
    expect(params.get('destStopId')).toBe('H0099');
    expect(params.has('originLat')).toBe(false);
    expect(params.has('destLat')).toBe(false);
  });

  // The backend accepts a different endpoint kind at each end.
  it('allows mixing a coordinate origin with a stop destination', async () => {
    const fetchMock = mockJson({ legs: [] });

    await planJourney({
      ...baseQuery,
      destination: { type: 'stop', stopId: 'H0099' },
    });

    const params = requestedUrl(fetchMock).searchParams;
    expect(params.get('originLat')).toBe('60.2');
    expect(params.get('destStopId')).toBe('H0099');
    expect(params.has('destLat')).toBe(false);
  });

  it('omits the walking speed so the engine applies its own default', async () => {
    const fetchMock = mockJson({ legs: [] });

    await planJourney(baseQuery);

    expect(requestedUrl(fetchMock).searchParams.has('WALKING_SPEED_MPS')).toBe(false);
  });

  it('sends the walking speed under the backend parameter name when given', async () => {
    const fetchMock = mockJson({ legs: [] });

    await planJourney({ ...baseQuery, walkingSpeedMps: 1.4 });

    expect(requestedUrl(fetchMock).searchParams.get('WALKING_SPEED_MPS')).toBe('1.4');
  });

  it('rejects a response that is not a journey', async () => {
    mockJson({ unexpected: true });

    const error = await planJourney(baseQuery).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('malformed');
  });
});

describe('getValidDates', () => {
  it('returns the array of dates', async () => {
    mockJson(['2026-08-14', '2026-08-15']);

    await expect(getValidDates()).resolves.toEqual(['2026-08-14', '2026-08-15']);
  });

  it('rejects a response that is not a list of strings', async () => {
    mockJson([1, 2, 3]);

    const error = await getValidDates().catch((e: unknown) => e);

    expect((error as ApiError).kind).toBe('malformed');
  });
});

describe('planJourney result shapes', () => {
  const query = {
    origin: { type: 'coordinate' as const, lat: 60.2, lon: 24.9 },
    destination: { type: 'coordinate' as const, lat: 60.3, lon: 25.0 },
    date: '2026-09-10',
    time: '08:00:00',
  };
  const journey = { startTime: '08:00', endTime: '08:30', legs: [] };

  function respondWith(body: unknown, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  /*
   * The engine answers with one itinerary today and is expected to grow into a
   * list. Both are absorbed here so that change costs nothing downstream.
   */
  it('wraps a single itinerary into a list', async () => {
    respondWith(journey);
    const result = await planJourney(query);
    expect(result).toHaveLength(1);
    expect(result[0]?.startTime).toBe('08:00');
  });

  it('passes a list through unchanged', async () => {
    respondWith([journey, { ...journey, startTime: '08:30' }]);
    const result = await planJourney(query);
    expect(result.map((j) => j.startTime)).toEqual(['08:00', '08:30']);
  });

  it('unwraps an enveloped list', async () => {
    respondWith({ journeys: [journey] });
    expect(await planJourney(query)).toHaveLength(1);
  });

  /*
   * The load-bearing one. A search that ran fine and found nothing is an empty
   * result, not a failure — even though the engine reports it as a 404.
   */
  it('turns NO_ROUTE_FOUND into an empty list rather than rejecting', async () => {
    respondWith({ errorCode: 'NO_ROUTE_FOUND', error: 'No route found.' }, 404);
    await expect(planJourney(query)).resolves.toEqual([]);
  });

  it('still rejects for a real failure', async () => {
    respondWith({ errorCode: 'BAD_DATE', error: 'Bad date.' }, 400);
    const error = await planJourney(query).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('BAD_DATE');
  });

  it('rejects a list containing something that is not an itinerary', async () => {
    respondWith([journey, { nope: true }]);
    const error = await planJourney(query).catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe('malformed');
  });
});

/*
 * The engine reports its own outcomes inside a 200 body: the response is
 * `{ errorCode, error }` where an itinerary would be, and the status says only
 * that the request was served. That shape has no `legs`, so without this the
 * "nothing runs then" answer surfaced as "this app cannot read the response".
 */
describe('planJourney with an outcome carried in a 200 body', () => {
  const query = {
    origin: { type: 'coordinate' as const, lat: 60.2, lon: 24.9 },
    destination: { type: 'coordinate' as const, lat: 60.3, lon: 25.0 },
    date: '2026-09-10',
    time: '08:00:00',
  };

  function respondWith(body: unknown, status = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
    );
  }

  it('reads NO_ROUTE_FOUND from a 200 as an empty list', async () => {
    respondWith({ errorCode: 'NO_ROUTE_FOUND', error: 'No route found.' });
    await expect(planJourney(query)).resolves.toEqual([]);
  });

  // 404 bodies carry extra fields alongside the envelope; a 200 may too.
  it('ignores the extra fields an engine error body carries', async () => {
    respondWith({
      errorCode: 'NO_ROUTE_FOUND',
      error: 'No route found.',
      targetArrivalTime: null,
      legs: [],
    });
    await expect(planJourney(query)).resolves.toEqual([]);
  });

  it('rejects a real engine failure carried in a 200', async () => {
    respondWith({
      errorCode: 'ORIGIN_OUT_OF_BOUNDS',
      error: 'Origin is outside the network.',
    });

    const error = await planJourney(query).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('ORIGIN_OUT_OF_BOUNDS');
    expect((error as ApiError).kind).toBe('http');
  });

  /*
   * A journey is not an error envelope just because something is null. The
   * check has to be for *both* fields being strings, or an itinerary would be
   * swallowed the day the engine adds an `error: null` to a success.
   */
  it('does not mistake an itinerary for an error envelope', async () => {
    respondWith({ startTime: '08:00', endTime: '08:30', legs: [], error: null });
    await expect(planJourney(query)).resolves.toHaveLength(1);
  });
});
