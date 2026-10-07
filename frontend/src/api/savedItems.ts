/**
 * `/api/user/saved-*` — the stops, lines and journeys kept on an account.
 *
 * Stored as embedded subdocuments on the user, which is why every write here
 * answers with the **whole user object** rather than with the one row it
 * touched. That is turned into a {@link SavedItems} bundle: one mutation
 * refreshes all three lists at once, so a rename cannot leave the other two
 * kinds showing what they showed before the request.
 *
 * As in `auth.ts` and `cards.ts`, this module synthesises the stable
 * `errorCode` these endpoints do not send, because a bare 400 means "already
 * saved" on one call and "that nickname is taken" on another.
 */

import type { WalkingPace } from '../config/journey';
import {
  roundCoordinate,
  toWalkingPace,
  type Favourite,
  type FavouriteDraft,
  type FavouritePlace,
  type ItineraryFavourite,
  type RouteFavourite,
  type StopFavourite,
} from '../features/favourites/favourite';
import { deleteJson, getJson, patchJson, postJson } from './client';
import { ApiError, isApiError } from './errors';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/** This exact stop, line-and-direction, or journey is already on the account. */
export const ALREADY_SAVED = 'ALREADY_SAVED';

/** Another saved item of the same kind already has the requested nickname. */
export const DUPLICATE_NICKNAME = 'DUPLICATE_NICKNAME';

/** Five of this kind are already saved. */
export const SAVED_LIMIT_REACHED = 'SAVED_LIMIT_REACHED';

/** The stop, line or saved row named does not exist. */
export const SAVED_ITEM_NOT_FOUND = 'SAVED_ITEM_NOT_FOUND';

/** All three kinds, as every mutation returns them. */
export interface SavedItems {
  stops: StopFavourite[];
  routes: RouteFavourite[];
  itineraries: ItineraryFavourite[];
}

export const NO_SAVED_ITEMS: SavedItems = { stops: [], routes: [], itineraries: [] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/**
 * The subdocument id, which every row must have.
 *
 * Without it a row cannot be renamed or removed, so one that arrives without
 * one is dropped rather than drawn — a card with controls that cannot work is
 * worse than a card that is not there.
 */
const idOf = (row: Record<string, unknown>): string | null => {
  const id = row['_id'] ?? row['id'];
  return typeof id === 'string' && id !== '' ? id : null;
};

function toSavedStop(raw: unknown): StopFavourite | null {
  if (!isRecord(raw)) return null;
  const id = idOf(raw);
  const stopId = raw['stopId'];
  if (id === null || typeof stopId !== 'string' || stopId === '') return null;

  return {
    kind: 'stop',
    id,
    stopId,
    nickname: text(raw['nickname']),
    savedAt: text(raw['savedOn']),
  };
}

function toSavedRoute(raw: unknown): RouteFavourite | null {
  if (!isRecord(raw)) return null;
  const id = idOf(raw);
  const lineId = raw['lineId'];
  const patternId = raw['patternId'];
  if (id === null || typeof lineId !== 'string' || lineId === '') return null;
  /*
   * A saved line without a direction is not a saved line. `patternId` is half
   * of what identifies it, and a row missing it would draw a card that opens
   * the wrong way round — the one thing `RouteFavourite` documents it must
   * never do.
   */
  if (typeof patternId !== 'number' || !Number.isFinite(patternId)) return null;

  return {
    kind: 'route',
    id,
    lineId,
    patternId,
    routeShortName: text(raw['routeShortName']),
    routeLongName: text(raw['routeLongName']),
    nickname: text(raw['nickname']),
    savedAt: text(raw['savedOn']),
  };
}

/** One end of a saved journey, or null when it is not a usable coordinate. */
function toPlace(raw: unknown, fallbackLabel: string): FavouritePlace | null {
  if (!isRecord(raw)) return null;
  const { lat, lon } = raw;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lon !== 'number' || !Number.isFinite(lon)) return null;

  return { label: text(raw['label']) ?? fallbackLabel, lat, lon };
}

function toSavedItinerary(raw: unknown): ItineraryFavourite | null {
  if (!isRecord(raw)) return null;
  const id = idOf(raw);
  if (id === null) return null;

  /*
   * The server's own defaults for a journey saved without labels, repeated
   * here so a row written before it had them still draws two named ends rather
   * than two blanks. They are not translated: they are what is stored.
   */
  const origin = toPlace(raw['origin'], 'Point A');
  const destination = toPlace(raw['destination'], 'Point B');
  if (origin === null || destination === null) return null;

  return {
    kind: 'itinerary',
    id,
    origin,
    destination,
    pace: toWalkingPace(raw['pace']),
    nickname: text(raw['nickname']),
    savedAt: text(raw['savedOn']),
  };
}

/** Reads one list, dropping rows too broken to draw. */
function listOf<T>(raw: unknown, parse: (row: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parse).filter((row): row is T => row !== null);
}

/** Unwraps the `{ data }` envelope these endpoints use. */
const dataOf = (body: unknown): unknown => (isRecord(body) ? body['data'] : undefined);

/**
 * All three lists out of a user object.
 *
 * What every mutation returns, and also what `/api/auth/me` carries — so a
 * session check could populate the store without a second round trip. The
 * store does not do that today, because the three list endpoints are the ones
 * that stay correct if the account response ever stops embedding them.
 */
export function toSavedItems(user: unknown): SavedItems {
  const record = isRecord(user) ? user : {};
  return {
    stops: listOf(record['savedStops'], toSavedStop),
    routes: listOf(record['savedRoutes'], toSavedRoute),
    itineraries: listOf(record['savedItineraries'], toSavedItinerary),
  };
}

/** A 400 carrying field complaints is a validation failure, whatever else it is. */
const rejectedAField = (error: ApiError): boolean =>
  Object.keys(error.fieldErrors).length > 0;

function mapError(error: unknown, forStatus: Record<number, string>): never {
  if (isApiError(error)) {
    if (error.status === 400 && rejectedAField(error)) {
      throw error.withCode('INVALID_SUBMISSION');
    }
    const code = error.status === null ? undefined : forStatus[error.status];
    if (code !== undefined) throw error.withCode(code);
  }
  throw error;
}

const ADD_ERRORS = {
  400: ALREADY_SAVED,
  404: SAVED_ITEM_NOT_FOUND,
  422: SAVED_LIMIT_REACHED,
} as const;

const RENAME_ERRORS = { 400: DUPLICATE_NICKNAME, 404: SAVED_ITEM_NOT_FOUND } as const;

/* ------------------------------------------------------------------ reads */

/**
 * Every saved item, in three requests.
 *
 * Issued together rather than in sequence: they are independent reads of the
 * same document, and the page needs all three before it can draw anything, so
 * waiting for each in turn would triple the time to first paint for no gain.
 */
export async function getSavedItems(options: CallOptions = {}): Promise<SavedItems> {
  const signal = options.signal ? { signal: options.signal } : {};

  const [stops, routes, itineraries] = await Promise.all([
    getJson('/api/user/saved-stops', signal),
    getJson('/api/user/saved-routes', signal),
    getJson('/api/user/saved-itineraries', signal),
  ]);

  return {
    stops: listOf(dataOf(stops), toSavedStop),
    routes: listOf(dataOf(routes), toSavedRoute),
    itineraries: listOf(dataOf(itineraries), toSavedItinerary),
  };
}

/* ----------------------------------------------------------------- writes */

/**
 * Saves a stop.
 *
 * **Addressed to `/saved-stops/:stopId`, which the router does not currently
 * mount.** `addUserSavedStop` and `addSavedStopValidationRules` both read
 * `req.params.stopId`, but the POST is attached to the `/saved-stops/:itemId`
 * route alongside the rename and the removal — so the parameter the controller
 * wants does not exist and every call answers 400 "Stop ID is required."
 *
 * Written against the contract the controller and the validator agree on,
 * rather than against the mount, because that is the one both halves of the
 * server already expect and it is a one-line route to add — exactly how
 * `/saved-routes/:lineId/:patternId` is already mounted apart from its own
 * `:itemId` route. Saving a stop starts working the moment it is, with no
 * change here.
 */
export async function addSavedStop(
  stopId: string,
  options: CallOptions = {},
): Promise<SavedItems> {
  try {
    const body = await postJson(
      `/api/user/saved-stops/${encodeURIComponent(stopId)}`,
      { body: {}, ...(options.signal ? { signal: options.signal } : {}) },
    );
    return toSavedItems(dataOf(body));
  } catch (error: unknown) {
    mapError(error, ADD_ERRORS);
  }
}

export async function addSavedRoute(
  lineId: string,
  patternId: number,
  options: CallOptions = {},
): Promise<SavedItems> {
  try {
    const body = await postJson(
      `/api/user/saved-routes/${encodeURIComponent(lineId)}/${encodeURIComponent(
        String(patternId),
      )}`,
      { body: {}, ...(options.signal ? { signal: options.signal } : {}) },
    );
    return toSavedItems(dataOf(body));
  } catch (error: unknown) {
    mapError(error, ADD_ERRORS);
  }
}

/**
 * Saves a journey.
 *
 * The coordinates are **rounded to six places before they are sent**, matching
 * what `identity` keys on and what the address bar writes. The server's
 * duplicate check compares stored numbers for exact equality, so without this
 * the same journey saved from a URL and from the form would be two rows to it
 * and one to the star — which would leave a filled star beside an unsaved
 * search, or a second row appearing where the first was expected.
 */
export async function addSavedItinerary(
  journey: { origin: FavouritePlace; destination: FavouritePlace; pace: WalkingPace },
  options: CallOptions = {},
): Promise<SavedItems> {
  const { origin, destination, pace } = journey;

  try {
    const body = await postJson('/api/user/saved-itineraries', {
      body: {
        originLat: roundCoordinate(origin.lat),
        originLon: roundCoordinate(origin.lon),
        originLabel: origin.label,
        destLat: roundCoordinate(destination.lat),
        destLon: roundCoordinate(destination.lon),
        destLabel: destination.label,
        pace,
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return toSavedItems(dataOf(body));
  } catch (error: unknown) {
    mapError(error, ADD_ERRORS);
  }
}

/** Saves whichever kind the draft is. */
export function addSavedItem(
  draft: FavouriteDraft,
  options: CallOptions = {},
): Promise<SavedItems> {
  switch (draft.kind) {
    case 'stop':
      return addSavedStop(draft.stopId, options);
    case 'route':
      return addSavedRoute(draft.lineId, draft.patternId, options);
    case 'itinerary':
      return addSavedItinerary(draft, options);
  }
}

/**
 * The path family one kind lives under.
 *
 * Rename and remove are the same request shape for all three, differing only
 * here, so they are written once and given the segment.
 */
const SEGMENT: Record<Favourite['kind'], string> = {
  stop: 'saved-stops',
  route: 'saved-routes',
  itinerary: 'saved-itineraries',
};

/**
 * Renames one saved item.
 *
 * An empty nickname is refused locally. The server reads a blank as "nothing
 * to change" and answers 400, where the old device-local store treated it as
 * "clear the name back to the one it came with" — a meaning the API has no way
 * to express, since it is the API that supplies the default in the first place.
 */
export async function renameSavedItem(
  kind: Favourite['kind'],
  itemId: string,
  nickname: string,
  options: CallOptions = {},
): Promise<SavedItems> {
  const trimmed = nickname.trim();
  if (trimmed === '') {
    throw new ApiError('malformed', 'A nickname cannot be empty.', {
      code: 'INVALID_SUBMISSION',
    });
  }

  try {
    const body = await patchJson(
      `/api/user/${SEGMENT[kind]}/${encodeURIComponent(itemId)}`,
      { body: { nickname: trimmed }, ...(options.signal ? { signal: options.signal } : {}) },
    );
    return toSavedItems(dataOf(body));
  } catch (error: unknown) {
    mapError(error, RENAME_ERRORS);
  }
}

/**
 * Removes one saved item.
 *
 * The server answers 200 whether or not the id matched — `$pull` on a missing
 * subdocument is a no-op — so this resolves for a row somebody else's tab
 * already removed, which is the right outcome either way: it is gone.
 */
export async function removeSavedItem(
  kind: Favourite['kind'],
  itemId: string,
  options: CallOptions = {},
): Promise<SavedItems> {
  try {
    const body = await deleteJson(
      `/api/user/${SEGMENT[kind]}/${encodeURIComponent(itemId)}`,
      { ...(options.signal ? { signal: options.signal } : {}) },
    );
    return toSavedItems(dataOf(body));
  } catch (error: unknown) {
    mapError(error, { 404: SAVED_ITEM_NOT_FOUND });
  }
}
