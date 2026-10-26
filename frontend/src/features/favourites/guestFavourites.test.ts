import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isApiError } from '../../api/errors';
import type { FavouriteDraft } from './favourite';
import {
  addGuestItem,
  forgetGuestItem,
  getGuestItems,
  hasGuestFavourites,
  readGuestFavourites,
  removeGuestItem,
  renameGuestItem,
} from './guestFavourites';

/*
 * The browser's own favourites, for a guest. What matters is that they refuse
 * exactly what the server refuses, with the same codes — the star and the page
 * cannot tell which list they are talking to, and must not need to.
 */

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const stop = (stopId: string): FavouriteDraft => ({ kind: 'stop', stopId });

const journey: FavouriteDraft = {
  kind: 'itinerary',
  origin: { label: 'Abdali', lat: 31.96123456789, lon: 35.91 },
  destination: { label: 'Sweileh', lat: 32.02, lon: 35.84 },
  pace: 'average',
};

async function refusal(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error: unknown) {
    return isApiError(error) ? error.code : 'not an ApiError';
  }
}

/** Answers `/api/routes/:lineId` as the line browser does. */
function serveLine(patternIds: number[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          lineId: 'bus-105',
          routeShortName: '105',
          routeType: 3,
          routeLongName: 'Madaba - Amman',
          directions: [0, 1],
          variants: patternIds.map((patternId) => ({
            patternId,
            directionId: 0,
            headsign: null,
            originStopName: 'Madaba',
            terminusStopName: 'Amman',
            stopCount: 10,
            tripCount: 5,
            firstDeparture: '06:00',
            lastDeparture: '22:00',
            serviceDates: [],
          })),
        }),
      ),
    ),
  );
}

describe('a guest’s favourites', () => {
  it('start empty, and keep what is saved across reads', async () => {
    expect(hasGuestFavourites()).toBe(false);

    await addGuestItem(stop('11920'));

    const items = await getGuestItems();
    expect(items.stops).toMatchObject([{ kind: 'stop', stopId: '11920', nickname: null }]);
    expect(hasGuestFavourites()).toBe(true);
  });

  it('refuse the same thing twice, as the server does', async () => {
    await addGuestItem(stop('11920'));
    expect(await refusal(addGuestItem(stop('11920')))).toBe('ALREADY_SAVED');
  });

  it('refuse a sixth of a kind, and let other kinds through', async () => {
    for (const id of ['1', '2', '3', '4', '5']) await addGuestItem(stop(id));

    expect(await refusal(addGuestItem(stop('6')))).toBe('SAVED_LIMIT_REACHED');
    expect(await refusal(addGuestItem(journey))).toBeNull();
  });

  it('round a journey’s coordinates as the server stores them', async () => {
    await addGuestItem(journey);
    const [saved] = (await getGuestItems()).itineraries;
    expect(saved?.origin.lat).toBe(31.961235);
  });

  it('name a saved route from its line, and refuse a variant the line lacks', async () => {
    serveLine([0, 1]);
    await addGuestItem({ kind: 'route', lineId: 'bus-105', patternId: 1 });
    expect((await getGuestItems()).routes).toMatchObject([
      { routeShortName: '105', routeLongName: 'Madaba - Amman' },
    ]);

    expect(
      await refusal(addGuestItem({ kind: 'route', lineId: 'bus-105', patternId: 9 })),
    ).toBe('SAVED_ITEM_NOT_FOUND');
  });

  it('refuse a nickname another of the same kind has, ignoring case', async () => {
    await addGuestItem(stop('1'));
    await addGuestItem(stop('2'));
    await addGuestItem(journey);
    const { stops, itineraries } = await getGuestItems();

    await renameGuestItem('stop', stops[0]!.id, 'Home');
    expect(await refusal(renameGuestItem('stop', stops[1]!.id, 'home'))).toBe('DUPLICATE_NICKNAME');
    // Unique within a kind only.
    expect(await refusal(renameGuestItem('itinerary', itineraries[0]!.id, 'Home'))).toBeNull();
    // And a different case of its own name is fine.
    expect(await refusal(renameGuestItem('stop', stops[0]!.id, 'HOME'))).toBeNull();
  });

  it('remove the right one, and refuse one that is not there', async () => {
    await addGuestItem(stop('1'));
    await addGuestItem(stop('2'));
    const [first] = (await getGuestItems()).stops;

    await removeGuestItem('stop', first!.id);
    expect((await getGuestItems()).stops.map((s) => s.stopId)).toEqual(['2']);
    expect(await refusal(removeGuestItem('stop', first!.id))).toBe('SAVED_ITEM_NOT_FOUND');
  });

  it('give every row its own id', async () => {
    await addGuestItem(stop('1'));
    await addGuestItem(stop('2'));
    const ids = readGuestFavourites().map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
  });

  /*
   * Storage is user-editable and outlives deploys, so anything it holds that
   * this version did not write reads as nothing rather than throwing.
   */
  it('read anything unrecognised as empty, and keep only the rows that are whole', async () => {
    localStorage.setItem('guest-favourites', 'not json');
    expect(readGuestFavourites()).toEqual([]);

    localStorage.setItem('guest-favourites', JSON.stringify({ version: 99, items: [] }));
    expect(readGuestFavourites()).toEqual([]);

    localStorage.setItem(
      'guest-favourites',
      JSON.stringify({
        version: 1,
        items: [
          { id: 'a', kind: 'stop', stopId: '1' },
          { id: 'b', kind: 'stop' },
          { id: 'c', kind: 'ferry', stopId: '2' },
          { id: 'd', kind: 'stop', stopId: '1' },
        ],
      }),
    );
    expect(readGuestFavourites().map((item) => item.id)).toEqual(['a']);
  });

  it('let a carried row go, and clear the key when nothing is left', async () => {
    await addGuestItem(stop('1'));
    forgetGuestItem(readGuestFavourites()[0]!);
    expect(localStorage.getItem('guest-favourites')).toBeNull();
  });
});
