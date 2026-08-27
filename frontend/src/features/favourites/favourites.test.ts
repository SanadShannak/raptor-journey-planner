import { beforeEach, describe, expect, it } from 'vitest';
import { fromSearchParams } from '../journey/searchParams';
import { DEFAULT_WALKING_PACE } from '../../config/journey';
import {
  FAVOURITES_PER_KIND,
  identity,
  type ItineraryFavourite,
  type RouteFavourite,
  type StopFavourite,
} from './favourite';
import {
  addFavourite,
  forgetFavourites,
  getFavourites,
  isFavourite,
  moveFavourite,
  refreshFavourite,
  removeFavourite,
  renameFavourite,
  reorderFavourite,
  toggleFavourite,
} from './favouritesStore';
import { readFavourites, writeFavourites } from './favouritesStorage';
import { journeyFavouriteParams } from './journeyFavouritePath';

/*
 * The store is one module shared by every test in this file, so it is emptied
 * between them — the same rule `forgetPlanner` follows.
 */
beforeEach(() => {
  forgetFavourites();
});

const stop = (id: string): StopFavourite => ({
  kind: 'stop',
  nickname: null,
  stopId: id,
  name: `Stop ${id}`,
  code: 'H0101',
  modes: [3],
});

const route = (patternId: number): RouteFavourite => ({
  kind: 'route',
  nickname: null,
  lineId: 'tram-1',
  patternId,
  routeShortName: '1',
  routeType: 0,
  routeLongName: 'Eira - Käpylä',
  headsign: 'Käpylä',
  directionId: 0,
});

const journey = (pace: ItineraryFavourite['pace']): ItineraryFavourite => ({
  kind: 'itinerary',
  nickname: null,
  origin: { label: 'Eira', lat: 60.155, lon: 24.94 },
  destination: { label: 'Käpylä', lat: 60.221, lon: 24.95 },
  pace,
});

describe('identity', () => {
  it('tells the two directions of one line apart', () => {
    expect(identity(route(1))).not.toBe(identity(route(2)));
  });

  /* The answer to open question 1: pace is part of what was saved. */
  it('treats the same journey at a different pace as a different favourite', () => {
    expect(identity(journey('slow'))).not.toBe(identity(journey('fast')));
  });

  it('ignores coordinate noise beyond the precision the URL carries', () => {
    const a = journey('average');
    const b: ItineraryFavourite = {
      ...a,
      origin: { ...a.origin, lat: 60.1550000001 },
    };
    expect(identity(b)).toBe(identity(a));
  });
});

describe('the store', () => {
  it('does not add the same thing twice', () => {
    expect(addFavourite(stop('A'))).toBe(true);
    expect(addFavourite(stop('A'))).toBe(false);
    expect(getFavourites()).toHaveLength(1);
  });

  it('caps each kind independently', () => {
    for (let n = 0; n < FAVOURITES_PER_KIND; n += 1) {
      expect(addFavourite(stop(`S${n}`))).toBe(true);
    }
    expect(addFavourite(stop('one-too-many'))).toBe(false);

    // A different kind still has all of its own room.
    expect(addFavourite(route(1))).toBe(true);
  });

  it('toggles off again', () => {
    toggleFavourite(stop('A'));
    expect(isFavourite(identity(stop('A')))).toBe(true);
    toggleFavourite(stop('A'));
    expect(isFavourite(identity(stop('A')))).toBe(false);
  });

  it('keeps a stable array reference until something changes', () => {
    const before = getFavourites();
    expect(getFavourites()).toBe(before);

    addFavourite(stop('A'));
    expect(getFavourites()).not.toBe(before);
  });

  it('stores an emptied nickname as none at all', () => {
    addFavourite(stop('A'));
    const key = identity(stop('A'));

    renameFavourite(key, '  Home  ');
    expect(getFavourites()[0]?.nickname).toBe('Home');

    renameFavourite(key, '   ');
    expect(getFavourites()[0]?.nickname).toBeNull();
  });

  it('moves an entry within its own kind, ignoring other kinds between', () => {
    addFavourite(stop('A'));
    addFavourite(route(1));
    addFavourite(stop('B'));

    moveFavourite(identity(stop('B')), -1);

    const stops = getFavourites().filter((f) => f.kind === 'stop');
    expect(stops.map((f) => (f as StopFavourite).stopId)).toEqual(['B', 'A']);
  });

  it('will not move past the end', () => {
    addFavourite(stop('A'));
    moveFavourite(identity(stop('A')), -1);
    expect(getFavourites()).toHaveLength(1);
  });

  it('refreshes a stale stored label from a live answer', () => {
    addFavourite(stop('A'));
    refreshFavourite(identity(stop('A')), { name: 'Renamed' });
    expect(getFavourites()[0]).toMatchObject({ name: 'Renamed' });
  });

  it('refuses a patch that would move the identity', () => {
    addFavourite(stop('A'));
    refreshFavourite(identity(stop('A')), { stopId: 'B' } as Partial<StopFavourite>);
    expect(getFavourites()[0]).toMatchObject({ stopId: 'A' });
  });

  it('removes the right one', () => {
    addFavourite(stop('A'));
    addFavourite(stop('B'));
    removeFavourite(identity(stop('A')));
    expect(getFavourites()).toHaveLength(1);
    expect(getFavourites()[0]).toMatchObject({ stopId: 'B' });
  });
});

describe('storage', () => {
  it('round-trips every kind', () => {
    const items = [stop('A'), route(7), journey('fast')];
    writeFavourites(items);
    expect(readFavourites()).toEqual(items);
  });

  it('reads an empty list when nothing has been written', () => {
    expect(readFavourites()).toEqual([]);
  });

  /*
   * localStorage is user-editable and survives deploys, so these are the real
   * inputs — not hypotheticals.
   */
  it('survives outright rubbish', () => {
    localStorage.setItem('favourites', 'not json at all');
    expect(readFavourites()).toEqual([]);
  });

  it('ignores an envelope from another version', () => {
    localStorage.setItem(
      'favourites',
      JSON.stringify({ version: 99, items: [stop('A')] }),
    );
    expect(readFavourites()).toEqual([]);
  });

  it('drops only the entry that is broken, keeping the rest', () => {
    localStorage.setItem(
      'favourites',
      JSON.stringify({
        version: 1,
        items: [stop('A'), { kind: 'stop', nickname: null }, stop('B')],
      }),
    );
    expect(readFavourites().map((f) => (f as StopFavourite).stopId)).toEqual(['A', 'B']);
  });

  it('rejects a mode it does not recognise rather than defaulting it', () => {
    localStorage.setItem(
      'favourites',
      JSON.stringify({ version: 1, items: [{ ...stop('A'), modes: [704] }] }),
    );
    expect(readFavourites()).toEqual([]);
  });

  it('rejects a journey whose coordinates are off the globe', () => {
    const bad = journey('average');
    localStorage.setItem(
      'favourites',
      JSON.stringify({
        version: 1,
        items: [{ ...bad, origin: { ...bad.origin, lat: 999 } }],
      }),
    );
    expect(readFavourites()).toEqual([]);
  });

  it('rejects a pace the app does not offer', () => {
    localStorage.setItem(
      'favourites',
      JSON.stringify({ version: 1, items: [{ ...journey('average'), pace: 'sprint' }] }),
    );
    expect(readFavourites()).toEqual([]);
  });
});

/*
 * The seam most likely to break silently: a favourite is only useful if the
 * planner can read back what it writes.
 */
describe('opening a saved journey', () => {
  const NOW = { date: '2026-09-10', time: '14:05' };

  it('writes today and now, never the saved moment', () => {
    const params = journeyFavouriteParams(journey('fast'), NOW);
    expect(params.get('date')).toBe('2026-09-10');
    expect(params.get('time')).toBe('14:05');
  });

  it('round-trips through the planner’s own reader', () => {
    const saved = journey('slow');
    const params = journeyFavouriteParams(saved, NOW);
    const restored = fromSearchParams(params, DEFAULT_WALKING_PACE);

    expect(restored).not.toBeNull();
    expect(restored?.origin?.label).toBe('Eira');
    expect(restored?.origin?.lat).toBeCloseTo(saved.origin.lat, 6);
    expect(restored?.destination?.label).toBe('Käpylä');
    expect(restored?.destination?.lon).toBeCloseTo(saved.destination.lon, 6);
    expect(restored?.pace).toBe('slow');
    expect(restored?.date).toBe('2026-09-10');
    expect(restored?.time).toBe('14:05');
  });
});

describe('reorderFavourite', () => {
  it('drops a card where another one sits', () => {
    addFavourite(stop('A'));
    addFavourite(stop('B'));
    addFavourite(stop('C'));

    reorderFavourite(identity(stop('A')), identity(stop('C')));

    expect(getFavourites().map((f) => (f as StopFavourite).stopId)).toEqual([
      'B',
      'C',
      'A',
    ]);
  });

  it('ignores entries of another kind sitting between them', () => {
    addFavourite(stop('A'));
    addFavourite(route(1));
    addFavourite(stop('B'));

    reorderFavourite(identity(stop('B')), identity(stop('A')));

    const kinds = getFavourites().map((f) => f.kind);
    expect(kinds).toEqual(['stop', 'route', 'stop']);
    expect(
      getFavourites()
        .filter((f): f is StopFavourite => f.kind === 'stop')
        .map((f) => f.stopId),
    ).toEqual(['B', 'A']);
  });

  it('refuses to move a card into another kind', () => {
    addFavourite(stop('A'));
    addFavourite(route(1));
    reorderFavourite(identity(stop('A')), identity(route(1)));
    expect(getFavourites().map((f) => f.kind)).toEqual(['stop', 'route']);
  });
});
