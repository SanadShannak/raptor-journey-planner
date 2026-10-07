import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALREADY_SAVED,
  SAVED_LIMIT_REACHED,
  addSavedItinerary,
  addSavedStop,
  getSavedItems,
  renameSavedItem,
  toSavedItems,
} from './savedItems';
import { ApiError } from './errors';

/**
 * A response, as the server actually sends one.
 *
 * Worth saying because these fixtures are the whole point of the file: the
 * shapes below were copied from live calls against a running backend, so a
 * test passing here means the parser agrees with the server rather than with
 * a guess about it.
 */
function respondWith(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  /*
   * A fresh `Response` per call, not one resolved value reused. A body can only
   * be read once, so a shared instance makes the *second* request in a test
   * fail with "Body is unusable" — which reads as a bug in the client rather
   * than in the fixture.
   */
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status })),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SAVED_STOP = {
  _id: '6ac6b497417f754fdb2af6b6',
  nickname: 'Rautatientori',
  stopId: '1040124',
  savedOn: '2026-10-07T21:07:35.592Z',
};

const SAVED_ROUTE = {
  _id: '6ac6b497417f754fdb2af6b7',
  nickname: 'Eira - Käpylä Direction: 0',
  lineId: 'tram-1',
  patternId: 0,
  routeShortName: '1',
  routeLongName: 'Eira - Käpylä',
  savedOn: '2026-10-07T21:07:35.592Z',
};

const SAVED_ITINERARY = {
  _id: '6ac6b4b4417f754fdb2af6bb',
  nickname: 'Commute',
  origin: { label: 'Helsinki Central', lat: 60.1699, lon: 24.9384 },
  destination: { label: 'Leppavaara', lat: 60.1841, lon: 24.8301 },
  pace: 'average',
  savedOn: '2026-10-07T21:08:04.392Z',
};

describe('toSavedItems', () => {
  /*
   * Every mutation answers with the whole user document rather than the row it
   * touched, so this is the shape most of the module's parsing runs on.
   */
  it('reads all three lists off a user document', () => {
    const items = toSavedItems({
      _id: 'u1',
      name: 'Verify User',
      email: 'verify@example.com',
      savedStops: [SAVED_STOP],
      savedRoutes: [SAVED_ROUTE],
      savedItineraries: [SAVED_ITINERARY],
    });

    expect(items.stops).toEqual([
      {
        kind: 'stop',
        id: SAVED_STOP._id,
        stopId: '1040124',
        nickname: 'Rautatientori',
        savedAt: '2026-10-07T21:07:35.592Z',
      },
    ]);
    expect(items.routes[0]).toMatchObject({
      kind: 'route',
      lineId: 'tram-1',
      patternId: 0,
      routeShortName: '1',
    });
    expect(items.itineraries[0]).toMatchObject({
      kind: 'itinerary',
      pace: 'average',
      origin: { label: 'Helsinki Central', lat: 60.1699 },
    });
  });

  it('reads a user with no saved anything as three empty lists', () => {
    expect(toSavedItems({ savedStops: [], savedRoutes: [], savedItineraries: [] })).toEqual(
      { stops: [], routes: [], itineraries: [] },
    );
    // And a body that is not a user at all, rather than throwing.
    expect(toSavedItems(null)).toEqual({ stops: [], routes: [], itineraries: [] });
  });

  /*
   * `savedAt` is the UTC instant exactly as sent, **not** a date. Resolving it
   * onto a calendar day needs the network's clock, which this layer does not
   * have — see `isoDateInZone`.
   */
  it('keeps savedOn as the instant it was sent, under its own name', () => {
    expect(toSavedItems({ savedStops: [SAVED_STOP] }).stops[0]?.savedAt).toBe(
      '2026-10-07T21:07:35.592Z',
    );
  });

  it('reads a row with no savedOn as one saved at no known moment', () => {
    const { savedOn: _omitted, ...withoutStamp } = SAVED_STOP;
    expect(toSavedItems({ savedStops: [withoutStamp] }).stops[0]?.savedAt).toBeNull();
  });

  /*
   * A row with no id cannot be renamed or removed, so it is dropped rather
   * than drawn: a card whose controls cannot work is worse than no card.
   */
  it('drops a row with no id, keeping the rest', () => {
    const items = toSavedItems({
      savedStops: [SAVED_STOP, { nickname: 'Orphan', stopId: '999' }],
    });
    expect(items.stops.map((row) => row.stopId)).toEqual(['1040124']);
  });

  /* Half of what identifies a saved line is its direction. */
  it('drops a saved route with no patternId', () => {
    const { patternId: _omitted, ...withoutPattern } = SAVED_ROUTE;
    expect(toSavedItems({ savedRoutes: [withoutPattern] }).routes).toEqual([]);
  });

  it('drops a saved journey missing an end', () => {
    const { destination: _omitted, ...withoutEnd } = SAVED_ITINERARY;
    expect(toSavedItems({ savedItineraries: [withoutEnd] }).itineraries).toEqual([]);
  });

  /*
   * Unlike the direction, a pace is a refinement of the question rather than
   * the question — so an unknown one is defaulted and the two ends are kept.
   */
  it('defaults an unrecognised pace rather than dropping the journey', () => {
    const items = toSavedItems({
      savedItineraries: [{ ...SAVED_ITINERARY, pace: 'sprint' }],
    });
    expect(items.itineraries[0]?.pace).toBe('average');
  });

  it('reads an empty nickname as no nickname at all', () => {
    const items = toSavedItems({ savedStops: [{ ...SAVED_STOP, nickname: '   ' }] });
    expect(items.stops[0]?.nickname).toBeNull();
  });
});

describe('getSavedItems', () => {
  it('reads the three list endpoints, which wrap their arrays in data', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const body = url.includes('saved-stops')
        ? { data: [SAVED_STOP] }
        : url.includes('saved-routes')
          ? { data: [SAVED_ROUTE] }
          : { data: [SAVED_ITINERARY] };
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await getSavedItems();

    expect(items.stops).toHaveLength(1);
    expect(items.routes).toHaveLength(1);
    expect(items.itineraries).toHaveLength(1);
  });

  /*
   * The cookie is the session and script cannot attach it by hand, so a call
   * made without credentials answers 401 no matter who is signed in. This is
   * the single easiest thing in the migration to get wrong silently.
   */
  it('sends credentials on every request', async () => {
    const fetchMock = respondWith({ data: [] });
    await getSavedItems();

    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).credentials).toBe('include');
    }
  });
});

describe('addSavedStop', () => {
  /*
   * The controller and the validator both read `req.params.stopId`, so that is
   * the contract this is written against — even though the router currently
   * attaches the POST to its `:itemId` route, which is why saving a stop
   * answers 400 until that one line is fixed.
   */
  it('addresses the stop id as a path segment', async () => {
    const fetchMock = respondWith({ data: { savedStops: [SAVED_STOP] } }, 201);
    await addSavedStop('1040124');

    expect(fetchMock.mock.calls[0]![0]).toContain('/api/user/saved-stops/1040124');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('POST');
  });

  it('encodes a stop id that is not URL-safe', async () => {
    const fetchMock = respondWith({ data: {} }, 201);
    await addSavedStop('HSL:1020444#H0101');

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('HSL%3A1020444%23H0101');
  });

  /*
   * These endpoints send no `errorCode`, so the status is all there is to go
   * on — and the same bare 400 means something different on a different call.
   */
  it('turns a bare 400 into "already saved"', async () => {
    respondWith({ message: 'This stop is already saved.' }, 400);

    const error = await addSavedStop('1040124').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(ALREADY_SAVED);
  });

  it('turns a 422 into "that kind is full"', async () => {
    respondWith({ message: 'Limit of maximum 5 saved stops per user reached.' }, 422);

    const error = await addSavedStop('1040124').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe(SAVED_LIMIT_REACHED);
  });

  /* A 400 that names fields is a validation failure, not a duplicate. */
  it('distinguishes a rejected field from a duplicate', async () => {
    respondWith(
      {
        errors: [
          { type: 'field', msg: 'Stop ID is required.', path: 'stopId', location: 'params' },
        ],
      },
      400,
    );

    const error = await addSavedStop('').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('INVALID_SUBMISSION');
    expect((error as ApiError).fieldErrors['stopId']).toBe('Stop ID is required.');
  });
});

describe('addSavedItinerary', () => {
  /*
   * The server compares stored latitudes and longitudes for **exact**
   * equality when deciding whether a journey is already saved, while
   * `identity` and the address bar both work at six places. Without the
   * rounding the same journey saved from a URL and from the form would be two
   * rows to the server and one to the star.
   */
  it('rounds coordinates to the precision the URL and identity use', async () => {
    const fetchMock = respondWith({ data: {} }, 201);

    await addSavedItinerary({
      origin: { label: 'Eira', lat: 60.15500000001, lon: 24.9400000009 },
      destination: { label: 'Käpylä', lat: 60.221, lon: 24.95 },
      pace: 'calm',
    });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.originLat).toBe(60.155);
    expect(body.originLon).toBe(24.94);
  });

  /* The field names are the server's, and nothing else checks they match. */
  it('sends the body field names the validator expects', async () => {
    const fetchMock = respondWith({ data: {} }, 201);

    await addSavedItinerary({
      origin: { label: 'Eira', lat: 60.155, lon: 24.94 },
      destination: { label: 'Käpylä', lat: 60.221, lon: 24.95 },
      pace: 'fast',
    });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(Object.keys(body).sort()).toEqual(
      ['destLabel', 'destLat', 'destLon', 'originLabel', 'originLat', 'originLon', 'pace'].sort(),
    );
    expect(body.pace).toBe('fast');
  });
});

describe('renameSavedItem', () => {
  it('addresses the right path family for each kind', async () => {
    const fetchMock = respondWith({ data: {} });

    await renameSavedItem('stop', 'abc', 'Home');
    await renameSavedItem('route', 'abc', 'Home');
    await renameSavedItem('itinerary', 'abc', 'Home');

    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls[0]).toContain('/api/user/saved-stops/abc');
    expect(urls[1]).toContain('/api/user/saved-routes/abc');
    expect(urls[2]).toContain('/api/user/saved-itineraries/abc');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('PATCH');
  });

  it('trims the nickname before sending it', async () => {
    const fetchMock = respondWith({ data: {} });
    await renameSavedItem('stop', 'abc', '  Home  ');

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.nickname).toBe('Home');
  });

  /*
   * An empty nickname used to mean "back to the name it came with". The server
   * supplies that default when a row is created and has no endpoint for
   * restoring it, so a blank is refused here rather than sent somewhere it
   * would only be rejected.
   */
  it('refuses an empty nickname without making a request', async () => {
    const fetchMock = respondWith({ data: {} });

    const error = await renameSavedItem('stop', 'abc', '   ').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_SUBMISSION');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
