import {
  DEFAULT_WALKING_PACE,
  WALKING_PACE_ORDER,
  type WalkingPace,
} from '../../config/journey';

/**
 * A stop, a line, or a journey somebody wants to get back to.
 *
 * A discriminated union on `kind`, the same shape the itinerary legs use. It
 * lives here rather than in `src/types/`, which is for types derived from real
 * API responses — and these very nearly are now, which is the change: a
 * favourite used to be a device-local record and is now a subdocument on the
 * account, read back from `/api/user/saved-*`.
 *
 * **A favourite no longer carries enough to draw itself, and that is the
 * trade the account made.** The old device-local record cached a stop's name,
 * its code and its modes beside the id so the list painted before anything
 * answered. The server keeps only the reference — a `stopId`, or a `lineId`
 * and a `patternId` — so the names and the mode badges come from the same live
 * requests each row already makes for its departures. What covers the gap is
 * the nickname: the server defaults it to the stop's name or the line's
 * destination at the moment of saving, so a card always has something true to
 * show while its board is on its way.
 *
 * The one thing it cannot cover is a stop renamed since it was saved, which
 * now reads under its old name until its board arrives and the row prefers the
 * live one. That is a second of staleness on a label, where the previous design
 * wrote a correction back to disk.
 */

/** How many of each kind can be saved. The server enforces it with a 422. */
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
   * The subdocument's `_id` on the account, and the only thing a rename or a
   * removal can be addressed to.
   *
   * Distinct from {@link identity}, which is derived from *what* a favourite
   * points at. Both are needed and neither does the other's job: the star has
   * to recognise a thing it has never been told the id of, and the API has no
   * idea what a content key is.
   */
  id: string;
  /**
   * What the reader calls it — "Home", "Work". Never a fallback label.
   *
   * Null is possible in the type but rare in practice: the server fills an
   * omitted nickname with the stop's name or the line's own description, so
   * null means a row written before that behaviour or one named with spaces.
   */
  nickname: string | null;
  /**
   * When it was saved, as the **UTC instant** the server stamped.
   *
   * Deliberately not a date. An instant is unambiguous and a date is not: a
   * journey saved at 00:30 in Helsinki is stamped 22:30 the previous day in
   * UTC, so the date sitting in the string is a day the reader never
   * experienced. Which calendar day it belongs to is a question only the
   * network's clock can answer, and the clock arrives with `/api/network`
   * rather than with this row — so the conversion happens where both are in
   * hand, through `isoDateInZone`, and the raw instant is what travels.
   *
   * Null for a row the server sent without one.
   */
  savedAt: string | null;
}

export interface StopFavourite extends FavouriteBase {
  kind: 'stop';
  stopId: string;
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
 *
 * The designation and the long name are the two display fields the server does
 * keep, which is what lets a saved line wear its number before its timetable
 * arrives. Its `routeType` is **not** stored, so the mode badge's colour and
 * silhouette wait for the live answer — see `FavouriteRouteRow`.
 */
export interface RouteFavourite extends FavouriteBase {
  kind: 'route';
  lineId: string;
  patternId: number;
  routeShortName: string | null;
  routeLongName: string | null;
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

/**
 * What the star offers to save, before the server has given it an id.
 *
 * Only the reference travels. The display fields a draft could supply — a
 * stop's name, a line's mode — are not sent because the server does not store
 * them, and sending them would suggest otherwise; it derives the default
 * nickname from the feed itself, which it reads more authoritatively than a
 * page that happens to be open.
 */
export type FavouriteDraft =
  | { kind: 'stop'; stopId: string }
  | { kind: 'route'; lineId: string; patternId: number }
  | {
      kind: 'itinerary';
      origin: FavouritePlace;
      destination: FavouritePlace;
      pace: WalkingPace;
    };

/** The order the groups appear in, fixed so the page never rearranges itself. */
export const FAVOURITE_KINDS: readonly FavouriteKind[] = ['stop', 'route', 'itinerary'];

/**
 * Coordinates at the same precision the address bar uses.
 *
 * Shared with `searchParams.ts` on purpose: a journey saved from the form and
 * the same journey read back out of a URL must produce the same identity, or
 * the star would fail to recognise what it just saved.
 *
 * It now has a second job. The server's own duplicate check compares stored
 * latitudes and longitudes for **exact** equality, so a journey sent at full
 * float precision and the same journey sent rounded are two different rows to
 * it while being one to the star. `addSavedItinerary` rounds on the way out
 * for exactly this reason, and this is the function it rounds with.
 */
export const COORDINATE_PLACES = 6;

export const roundCoordinate = (value: number): number =>
  Number(value.toFixed(COORDINATE_PLACES));

const round = (value: number): string => String(roundCoordinate(value));

const placeKey = (place: FavouritePlace): string =>
  `${round(place.lat)},${round(place.lon)}`;

/**
 * What makes two favourites the same one.
 *
 * Used as the React key, the drag key, and the test the star applies to decide
 * whether what is on screen is already saved — which is why it has to be
 * derived from *content* rather than from the server's id. The star on a stop
 * page knows the stop; it has never heard of the subdocument.
 *
 * Accepts a draft as well as a saved favourite, so the two are compared on the
 * same terms. Mutations address {@link FavouriteBase.id} instead.
 *
 * A journey's identity **includes the pace**. The same two points walked slowly
 * and walked briskly are different questions with different answers, and
 * folding them together would make the star claim a search was saved when what
 * was saved would return something else.
 */
export function identity(favourite: Favourite | FavouriteDraft): string {
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

/**
 * A stored pace, narrowed back to one this app knows.
 *
 * The server's validator accepts the same four words, so an unrecognised value
 * means a row written before that validator or by something else entirely.
 * Defaulted rather than dropped: the two ends of the journey are the part worth
 * keeping, and a pace is a refinement of the question rather than the question.
 */
export function toWalkingPace(value: unknown): WalkingPace {
  return WALKING_PACE_ORDER.find((pace) => pace === value) ?? DEFAULT_WALKING_PACE;
}
