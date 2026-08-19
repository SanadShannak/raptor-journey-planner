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
