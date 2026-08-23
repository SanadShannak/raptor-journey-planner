import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStopsInBounds } from './stops';

/*
 * The parsing, not the request. A stop that cannot be placed or cannot be asked
 * about is not a stop this layer can use, and dropping it quietly is better
 * than drawing a marker at `undefined, undefined` — which Leaflet renders in
 * the Atlantic rather than refusing.
 */
function respondWith(body: unknown) {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const area = { minLat: 60.1, minLon: 24.9, maxLat: 60.2, maxLon: 25.0 };

afterEach(() => vi.unstubAllGlobals());

describe('getStopsInBounds', () => {
  it('sends the box as four numbers', async () => {
    const fetchMock = respondWith({ stops: [], truncated: false });

    await getStopsInBounds(area);

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/stops');
    expect(url.searchParams.get('minLat')).toBe('60.1');
    expect(url.searchParams.get('maxLon')).toBe('25');
  });

  it('reads a stop, and keeps the modes that pick its icon', async () => {
    respondWith({
      stops: [
        {
          id: '1020444',
          name: 'Lasipalatsi',
          code: 'H0101',
          lat: 60.170461,
          lon: 24.937728,
          description: 'Mannerheimintie',
          fareZone: 'A',
          wheelchairAccessible: true,
          modes: [0, 3],
        },
      ],
      truncated: false,
    });

    const { stops, truncated } = await getStopsInBounds(area);

    expect(truncated).toBe(false);
    expect(stops[0]).toEqual({
      id: '1020444',
      name: 'Lasipalatsi',
      code: 'H0101',
      lat: 60.170461,
      lon: 24.937728,
      description: 'Mannerheimintie',
      fareZone: 'A',
      wheelchairAccessible: true,
      modes: [0, 3],
    });
  });

  it('drops a stop it could not place or could not name', async () => {
    respondWith({
      stops: [
        { id: 'A', name: 'Fine', lat: 60.1, lon: 24.9, modes: [] },
        { id: 'B', name: 'No position', lat: null, lon: null, modes: [] },
        { name: 'No id', lat: 60.1, lon: 24.9, modes: [] },
        'not a stop at all',
      ],
      truncated: false,
    });

    const { stops } = await getStopsInBounds(area);

    expect(stops.map((stop) => stop.id)).toEqual(['A']);
  });

  /*
   * Absent is not the same as "not accessible". Collapsing the two would tell a
   * wheelchair user a stop is unusable when the truth is nobody published it.
   */
  it('keeps "nobody said" apart from "no"', async () => {
    respondWith({
      stops: [
        { id: 'A', name: 'A', lat: 60.1, lon: 24.9, modes: [] },
        { id: 'B', name: 'B', lat: 60.1, lon: 24.9, wheelchairAccessible: false, modes: [] },
      ],
      truncated: false,
    });

    const { stops } = await getStopsInBounds(area);

    expect(stops.map((stop) => stop.wheelchairAccessible)).toEqual([null, false]);
  });

  // The cap is the backend's, and a client must be able to see it was reached.
  it('reports a truncated answer as truncated', async () => {
    respondWith({ stops: [], truncated: true });
    expect((await getStopsInBounds(area)).truncated).toBe(true);
  });

  it('survives a body with no stops in it at all', async () => {
    respondWith({});
    expect(await getStopsInBounds(area)).toEqual({ stops: [], truncated: false });
  });
});
