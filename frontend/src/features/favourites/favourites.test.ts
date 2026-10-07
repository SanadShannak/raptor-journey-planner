import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromSearchParams } from '../journey/searchParams';
import { DEFAULT_WALKING_PACE } from '../../config/journey';
import { forgetSession } from '../../auth/sessionStore';
import {
  identity,
  type FavouriteDraft,
  type ItineraryFavourite,
  type StopFavourite,
} from './favourite';
import {
  forgetFavourites,
  getFavourites,
  getSavedState,
  isFavourite,
  loadFavourites,
  moveFavourite,
  removeFavourite,
  renameFavourite,
  reorderFavourite,
  saveFavourite,
  toggleFavourite,
} from './favouritesStore';
import { journeyFavouriteParams } from './journeyFavouritePath';

/*
 * The store is one module shared by every test in this file, so it is emptied
 * between them — the same rule `forgetPlanner` follows. The session store goes
 * with it, because a 401 reaches into it.
 */
beforeEach(() => {
  forgetFavourites();
  forgetSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------- the fixtures */

const stopDraft = (id: string): FavouriteDraft => ({ kind: 'stop', stopId: id });

const routeDraft = (patternId: number): FavouriteDraft => ({
  kind: 'route',
  lineId: 'tram-1',
  patternId,
});

const journeyDraft = (pace: ItineraryFavourite['pace']): FavouriteDraft => ({
  kind: 'itinerary',
  origin: { label: 'Eira', lat: 60.155, lon: 24.94 },
  destination: { label: 'Käpylä', lat: 60.221, lon: 24.95 },
  pace,
});

/** A saved stop subdocument, as the server stores one. */
const savedStop = (id: string) => ({
  _id: `id-${id}`,
  nickname: `Stop ${id}`,
  stopId: id,
  savedOn: '2026-10-07T21:07:35.592Z',
});

const savedRoute = (patternId: number) => ({
  _id: `id-route-${patternId}`,
  nickname: 'Eira - Käpylä',
  lineId: 'tram-1',
  patternId,
  routeShortName: '1',
  routeLongName: 'Eira - Käpylä',
  savedOn: '2026-10-07T21:07:35.592Z',
});

/** Serves the three list reads, then the user document for every write. */
function serveLists(user: {
  savedStops?: unknown[];
  savedRoutes?: unknown[];
  savedItineraries?: unknown[];
}): ReturnType<typeof vi.fn> {
  const stops = user.savedStops ?? [];
  const routes = user.savedRoutes ?? [];
  const itineraries = user.savedItineraries ?? [];

  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';

    if (method === 'GET') {
      const list = url.includes('saved-stops')
        ? stops
        : url.includes('saved-routes')
          ? routes
          : itineraries;
      return Promise.resolve(new Response(JSON.stringify({ data: list })));
    }

    // Writes answer with the whole user document.
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: { savedStops: stops, savedRoutes: routes, savedItineraries: itineraries },
        }),
      ),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/* -------------------------------------------------------------- the identity */

describe('identity', () => {
  it('tells the two directions of one line apart', () => {
    expect(identity(routeDraft(1))).not.toBe(identity(routeDraft(2)));
  });

  /* Pace is part of what was saved: the same two points at a different pace
     is a different question with a different answer. */
  it('treats the same journey at a different pace as a different favourite', () => {
    expect(identity(journeyDraft('slow'))).not.toBe(identity(journeyDraft('fast')));
  });

  it('ignores coordinate noise beyond the precision the URL carries', () => {
    const a = journeyDraft('average') as Extract<FavouriteDraft, { kind: 'itinerary' }>;
    expect(
      identity({ ...a, origin: { ...a.origin, lat: 60.1550000001 } }),
    ).toBe(identity(a));
  });

  /*
   * The load-bearing property: a draft the star builds and the row the server
   * sends back must key the same, or the star would not recognise what it
   * just saved.
   */
  it('keys a draft and the saved row it became the same', () => {
    const row: StopFavourite = {
      kind: 'stop',
      id: 'id-A',
      stopId: 'A',
      nickname: 'Stop A',
      savedAt: null,
    };
    expect(identity(row)).toBe(identity(stopDraft('A')));
  });
});

/* ----------------------------------------------------------------- the store */

describe('loadFavourites', () => {
  it('flattens the three lists into one sequence', async () => {
    serveLists({ savedStops: [savedStop('A')], savedRoutes: [savedRoute(1)] });

    await loadFavourites();

    expect(getSavedState().status).toBe('ready');
    expect(getFavourites().map((row) => row.kind)).toEqual(['stop', 'route']);
  });

  /*
   * A 401 is not a failure to report — it means the session went away. The
   * list goes back to idle rather than to failed, because there is nothing
   * wrong: there is simply nobody to have favourites.
   */
  it('reads a 401 as an absent session rather than an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ message: 'Not authorized' }), { status: 401 })),
      ),
    );

    await loadFavourites();

    expect(getSavedState().status).toBe('idle');
    expect(getSavedState().error).toBeNull();
    expect(getFavourites()).toEqual([]);
  });

  it('reports anything else as failed, with the error kept for the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ message: 'boom' }), { status: 500 })),
      ),
    );

    await loadFavourites();

    expect(getSavedState().status).toBe('failed');
    expect(getSavedState().error).not.toBeNull();
  });

  /*
   * `useSyncExternalStore` compares snapshots by reference, so a fresh object
   * on every read would re-render forever.
   */
  it('keeps a stable snapshot reference until something changes', async () => {
    const before = getSavedState();
    expect(getSavedState()).toBe(before);

    serveLists({ savedStops: [savedStop('A')] });
    await loadFavourites();

    expect(getSavedState()).not.toBe(before);
  });
});

describe('saving and removing', () => {
  it('reflects what the server came back with, not what was asked for', async () => {
    serveLists({ savedStops: [savedStop('A')] });

    await saveFavourite(stopDraft('A'));

    // The id and the default nickname are the server's, so they can only
    // arrive in its response — nothing is written optimistically.
    expect(getFavourites()[0]).toMatchObject({
      id: 'id-A',
      stopId: 'A',
      nickname: 'Stop A',
    });
  });

  it('rejects rather than failing quietly when the server refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'This stop is already saved.' }), {
            status: 400,
          }),
        ),
      ),
    );

    await expect(saveFavourite(stopDraft('A'))).rejects.toThrow();
  });

  it('toggles off by addressing the stored row, not the draft', async () => {
    serveLists({ savedStops: [savedStop('A')] });
    await loadFavourites();
    expect(isFavourite(identity(stopDraft('A')))).toBe(true);

    const fetchMock = serveLists({});
    await toggleFavourite(stopDraft('A'));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('DELETE');
    // The subdocument id, which is the only thing a removal can be sent to.
    expect(url).toContain('/api/user/saved-stops/id-A');
    expect(isFavourite(identity(stopDraft('A')))).toBe(false);
  });

  it('removes the right one', async () => {
    serveLists({ savedStops: [savedStop('A'), savedStop('B')] });
    await loadFavourites();

    serveLists({ savedStops: [savedStop('B')] });
    await removeFavourite('stop', 'id-A');

    expect(getFavourites()).toHaveLength(1);
    expect(getFavourites()[0]).toMatchObject({ stopId: 'B' });
  });

  it('renames through the server and takes the answer as the truth', async () => {
    serveLists({ savedStops: [{ ...savedStop('A'), nickname: 'Home' }] });

    await renameFavourite('stop', 'id-A', 'Home');

    expect(getFavourites()[0]?.nickname).toBe('Home');
  });
});

/* ---------------------------------------------------------------- the order */

describe('ordering', () => {
  /*
   * The arrangement is local to the tab — the subdocuments carry no order
   * field — so what these cover is that it behaves consistently while it
   * lasts, and that it survives a server answer rather than being undone by
   * the next rename.
   */
  it('moves an entry within its own kind, ignoring other kinds between', async () => {
    serveLists({
      savedStops: [savedStop('A'), savedStop('B')],
      savedRoutes: [savedRoute(1)],
    });
    await loadFavourites();

    moveFavourite(identity(stopDraft('B')), -1);

    const stops = getFavourites().filter(
      (row): row is StopFavourite => row.kind === 'stop',
    );
    expect(stops.map((row) => row.stopId)).toEqual(['B', 'A']);
  });

  it('will not move past the end', async () => {
    serveLists({ savedStops: [savedStop('A')] });
    await loadFavourites();

    moveFavourite(identity(stopDraft('A')), -1);
    expect(getFavourites()).toHaveLength(1);
  });

  it('drops a card where another one sits', async () => {
    serveLists({ savedStops: [savedStop('A'), savedStop('B'), savedStop('C')] });
    await loadFavourites();

    reorderFavourite(identity(stopDraft('A')), identity(stopDraft('C')));

    expect(
      getFavourites().map((row) => (row as StopFavourite).stopId),
    ).toEqual(['B', 'C', 'A']);
  });

  it('refuses to move a card into another kind', async () => {
    serveLists({ savedStops: [savedStop('A')], savedRoutes: [savedRoute(1)] });
    await loadFavourites();

    reorderFavourite(identity(stopDraft('A')), identity(routeDraft(1)));
    expect(getFavourites().map((row) => row.kind)).toEqual(['stop', 'route']);
  });

  /*
   * The reason the arrangement is re-applied to every answer rather than only
   * to the first. Each mutation returns the whole user in insertion order, so
   * without this a rename would snap a dragged card back and look like the
   * rename had undone the drag.
   */
  it('survives a later server answer rather than snapping back', async () => {
    serveLists({ savedStops: [savedStop('A'), savedStop('B')] });
    await loadFavourites();

    reorderFavourite(identity(stopDraft('B')), identity(stopDraft('A')));
    expect(getFavourites().map((row) => (row as StopFavourite).stopId)).toEqual(['B', 'A']);

    // A rename comes back with the server's own order, A then B.
    serveLists({ savedStops: [savedStop('A'), { ...savedStop('B'), nickname: 'Home' }] });
    await renameFavourite('stop', 'id-B', 'Home');

    expect(getFavourites().map((row) => (row as StopFavourite).stopId)).toEqual(['B', 'A']);
  });

  /* A newly saved favourite joins the end rather than jumping into the middle
     of an arrangement somebody made on purpose. */
  it('puts something never arranged after everything that was', async () => {
    serveLists({ savedStops: [savedStop('A'), savedStop('B')] });
    await loadFavourites();
    reorderFavourite(identity(stopDraft('B')), identity(stopDraft('A')));

    serveLists({ savedStops: [savedStop('A'), savedStop('B'), savedStop('C')] });
    await saveFavourite(stopDraft('C'));

    expect(getFavourites().map((row) => (row as StopFavourite).stopId)).toEqual([
      'B',
      'A',
      'C',
    ]);
  });
});

/*
 * The seam most likely to break silently: a favourite is only useful if the
 * planner can read back what it writes.
 */
describe('opening a saved journey', () => {
  const NOW = { date: '2026-09-10', time: '14:05' };

  const saved = (pace: ItineraryFavourite['pace']): ItineraryFavourite => ({
    kind: 'itinerary',
    id: 'id-j',
    nickname: null,
    origin: { label: 'Eira', lat: 60.155, lon: 24.94 },
    destination: { label: 'Käpylä', lat: 60.221, lon: 24.95 },
    pace,
    savedAt: '2026-10-07T21:08:04.392Z',
  });

  it('writes today and now, never the saved moment', () => {
    const params = journeyFavouriteParams(saved('fast'), NOW);
    expect(params.get('date')).toBe('2026-09-10');
    expect(params.get('time')).toBe('14:05');
  });

  it('round-trips through the planner’s own reader', () => {
    const journey = saved('slow');
    const restored = fromSearchParams(
      journeyFavouriteParams(journey, NOW),
      DEFAULT_WALKING_PACE,
    );

    expect(restored).not.toBeNull();
    expect(restored?.origin?.label).toBe('Eira');
    expect(restored?.origin?.lat).toBeCloseTo(journey.origin.lat, 6);
    expect(restored?.destination?.label).toBe('Käpylä');
    expect(restored?.destination?.lon).toBeCloseTo(journey.destination.lon, 6);
    expect(restored?.pace).toBe('slow');
    expect(restored?.date).toBe('2026-09-10');
    expect(restored?.time).toBe('14:05');
  });
});
