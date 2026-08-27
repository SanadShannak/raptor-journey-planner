import type { WalkingPace } from '../../config/journey';
import type { GtfsRouteType } from '../../types/journey';

/**
 * A stop, a line, or a journey somebody wants to get back to.
 *
 * A discriminated union on `kind`, the same shape the itinerary legs use. It
 * lives here rather than in `src/types/`, which is for types derived from real
 * API responses — a favourite was never on the wire.
 *
 * **Every favourite carries enough to draw itself.** The name of a stop and the
 * designation of a line are stored beside their ids, so the list paints before
 * a single request answers and still paints when the backend is down — which is
 * a state a saved list has to survive, since it is the one place somebody looks
 * when they are in a hurry. The stored copy is a cache, not a record: whatever
 * a live answer says supersedes it, and writes itself back.
 */

/** How many of each kind can be saved. */
export const FAVOURITES_PER_KIND = 5;

/**
 * Why there is a cap at all.
 *
 * Each saved stop is its own departure board, re-asked every minute; each saved
 * line pulls a whole service day, which reaches ~440 kB on HSL's largest
 * pattern. Five of each is a page that stays quick on a phone. It is a product
 * limit rather than a technical one, so it is stated to the reader rather than
 * enforced silently — see `strings.favourites.limitReached`.
 */

/** An end of a saved journey. Exactly what the address bar already carries. */
export interface FavouritePlace {
  label: string;
  lat: number;
  lon: number;
}

interface FavouriteBase {
  /**
   * What the reader calls it — "Home", "Work" — or null for the name it came
   * with. Never a fallback label: an empty nickname is no nickname.
   */
  nickname: string | null;
}

export interface StopFavourite extends FavouriteBase {
  kind: 'stop';
  stopId: string;
  name: string;
  code: string | null;
  modes: GtfsRouteType[];
}

/**
 * A line **in one direction**.
 *
 * The direction is part of what is saved, not a hint: somebody who favourites
 * the 3 towards the centre does not want the one going home. That makes
 * `patternId` part of the identity, and it also makes this the one favourite
 * that can go stale — pattern ids are stable for the life of a dataset but not
 * across a pipeline re-run. When it no longer resolves the row **says so**
 * rather than quietly showing a different direction's times.
 */
export interface RouteFavourite extends FavouriteBase {
  kind: 'route';
  lineId: string;
  patternId: number;
  routeShortName: string;
  routeType: GtfsRouteType;
  routeLongName: string | null;
  headsign: string | null;
  directionId: 0 | 1 | null;
}

/**
 * A search, minus when.
 *
 * The date and the time are deliberately absent: opening one asks the question
 * again *now*. Everything else is exactly what `toSearchParams` writes, which
 * is what lets the planner run it with no new machinery.
 */
export interface ItineraryFavourite extends FavouriteBase {
  kind: 'itinerary';
  origin: FavouritePlace;
  destination: FavouritePlace;
  pace: WalkingPace;
}

export type Favourite = StopFavourite | RouteFavourite | ItineraryFavourite;

export type FavouriteKind = Favourite['kind'];

/** The order the groups appear in, fixed so the page never rearranges itself. */
export const FAVOURITE_KINDS: readonly FavouriteKind[] = ['stop', 'route', 'itinerary'];

/**
 * Coordinates at the same precision the address bar uses.
 *
 * Shared with `searchParams.ts` on purpose: a journey saved from the form and
 * the same journey read back out of a URL must produce the same identity, or
 * the star would fail to recognise what it just saved.
 */
const COORDINATE_PLACES = 6;

const round = (value: number): string => String(Number(value.toFixed(COORDINATE_PLACES)));

const placeKey = (place: FavouritePlace): string =>
  `${round(place.lat)},${round(place.lon)}`;

/**
 * What makes two favourites the same one.
 *
 * Used as the storage key, the React key, and the argument to remove — one
 * value doing all three, so there is no separate id to keep in step and no
 * randomness to make a stored list unreproducible in a test.
 *
 * A journey's identity **includes the pace**. The same two points walked slowly
 * and walked briskly are different questions with different answers, and
 * folding them together would make the star claim a search was saved when what
 * was saved would return something else.
 */
export function identity(favourite: Favourite): string {
  switch (favourite.kind) {
    case 'stop':
      return `stop:${favourite.stopId}`;
    case 'route':
      return `route:${favourite.lineId}:${favourite.patternId}`;
    case 'itinerary':
      return `itinerary:${placeKey(favourite.origin)}:${placeKey(
        favourite.destination,
      )}:${favourite.pace}`;
  }
}

/** What to call it: the reader's own name for it, or the one it came with. */
export function favouriteLabel(favourite: Favourite, fallback: string): string {
  const nickname = favourite.nickname?.trim() ?? '';
  return nickname === '' ? fallback : nickname;
}
