import { getLine } from '../../api/routes';
import {
  ALREADY_SAVED,
  DUPLICATE_NICKNAME,
  SAVED_ITEM_NOT_FOUND,
  SAVED_LIMIT_REACHED,
  type SavedItems,
} from '../../api/savedItems';
import { ApiError } from '../../api/errors';
import {
  FAVOURITES_PER_KIND,
  identity,
  roundCoordinate,
  toWalkingPace,
  type Favourite,
  type FavouriteDraft,
  type FavouriteKind,
  type FavouritePlace,
  type ItineraryFavourite,
  type RouteFavourite,
  type StopFavourite,
} from './favourite';

/**
 * Favourites for somebody who is not signed in, kept in this browser.
 *
 * The same four operations `api/savedItems.ts` offers — read, add, rename,
 * remove — answering in the same shape and refusing with the same codes, so
 * the store, the star and the page cannot tell which one they are talking to.
 * The server's rules are reproduced rather than approximated: five of each
 * kind, one of each thing, nicknames unique within a kind ignoring case, an
 * empty nickname by default.
 *
 * **Storage, unlike the signed-in list, and on purpose.** A guest has nowhere
 * else to keep anything, and a favourite that vanished on reload would not be
 * one. `localStorage` because it is a fact about the visitor rather than about
 * one visit — the same reasoning as the tours' "seen" list.
 *
 * Defensive on the way in, like every reader of storage here: the envelope is
 * versioned, each row is checked, and anything unrecognised reads as nothing
 * rather than throwing. Storage that cannot be read or written at all — a
 * private window, blocked site data — behaves as an empty list that does not
 * keep what is added, rather than taking the page down.
 *
 * A different key from the pre-account `favourites` some browsers may still
 * hold: that one had another shape, and reading it as this would be a guess.
 */

const STORAGE_KEY = 'guest-favourites';

/** Bump when the shape changes; any other version reads as empty. */
const VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function toPlace(raw: unknown): FavouritePlace | null {
  if (!isRecord(raw) || !finite(raw['lat']) || !finite(raw['lon'])) return null;
  return { label: text(raw['label']) ?? '', lat: raw['lat'], lon: raw['lon'] };
}

/** One stored row, or null when it is not one this version wrote. */
function toFavourite(raw: unknown): Favourite | null {
  if (!isRecord(raw)) return null;
  const id = text(raw['id']);
  if (id === null) return null;
  const base = { id, nickname: text(raw['nickname']), savedAt: text(raw['savedAt']) };

  switch (raw['kind']) {
    case 'stop': {
      const stopId = text(raw['stopId']);
      return stopId === null ? null : { ...base, kind: 'stop', stopId };
    }
    case 'route': {
      const lineId = text(raw['lineId']);
      const patternId = raw['patternId'];
      if (lineId === null || !finite(patternId)) return null;
      return {
        ...base,
        kind: 'route',
        lineId,
        patternId,
        routeShortName: text(raw['routeShortName']),
        routeLongName: text(raw['routeLongName']),
      };
    }
    case 'itinerary': {
      const origin = toPlace(raw['origin']);
      const destination = toPlace(raw['destination']);
      if (origin === null || destination === null) return null;
      return { ...base, kind: 'itinerary', origin, destination, pace: toWalkingPace(raw['pace']) };
    }
    default:
      return null;
  }
}

/** Everything stored, in the order it was saved. */
function read(): Favourite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope) || envelope['version'] !== VERSION) return [];
    const items = envelope['items'];
    if (!Array.isArray(items)) return [];

    // One of each thing, as the server would have it, however the storage
    // was edited: the first copy wins.
    const seen = new Set<string>();
    return items
      .map(toFavourite)
      .filter((item): item is Favourite => {
        if (item === null || seen.has(identity(item))) return false;
        seen.add(identity(item));
        return true;
      });
  } catch {
    return [];
  }
}

function write(items: readonly Favourite[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, items }));
    }
  } catch {
    // Storage refused; the list simply does not outlive this page.
  }
}

/** Grouped as the server answers, so the store reads both the same way. */
function grouped(items: readonly Favourite[]): SavedItems {
  return {
    stops: items.filter((item): item is StopFavourite => item.kind === 'stop'),
    routes: items.filter((item): item is RouteFavourite => item.kind === 'route'),
    itineraries: items.filter((item): item is ItineraryFavourite => item.kind === 'itinerary'),
  };
}

/** A refusal shaped exactly like the server's, so one message table serves both. */
function refuse(status: number, code: string): ApiError {
  return new ApiError('http', `Refused in this browser: ${code}`, { status, code });
}

function newId(): string {
  return `guest-${crypto.randomUUID()}`;
}

/* ------------------------------------------------------------------ reads */

export function hasGuestFavourites(): boolean {
  return read().length > 0;
}

/** The guest's favourites, in saved order — for the transfer into an account. */
export function readGuestFavourites(): readonly Favourite[] {
  return read();
}

export async function getGuestItems(): Promise<SavedItems> {
  return grouped(read());
}

/* ----------------------------------------------------------------- writes */

export async function addGuestItem(draft: FavouriteDraft): Promise<SavedItems> {
  const items = read();
  const key = identity(draft);
  if (items.some((item) => identity(item) === key)) throw refuse(400, ALREADY_SAVED);
  if (items.filter((item) => item.kind === draft.kind).length >= FAVOURITES_PER_KIND) {
    throw refuse(422, SAVED_LIMIT_REACHED);
  }

  /*
   * `savedAt` is an instant in UTC, as the server stamps it, and is read
   * through the network's zone wherever a date is shown — so this is not the
   * "today in the browser's zone" CLAUDE.md warns against.
   */
  const base = { id: newId(), nickname: null, savedAt: new Date().toISOString() };
  let saved: Favourite;
  switch (draft.kind) {
    case 'stop':
      saved = { ...base, kind: 'stop', stopId: draft.stopId };
      break;
    case 'route': {
      /*
       * The server names a saved route from the line itself, and so does this:
       * the row shows "105" and its long name, not a line id. Asking also
       * refuses a line or variant this feed does not have, as the server would.
       */
      const line = await getLine(draft.lineId);
      if (!line.variants.some((variant) => variant.patternId === draft.patternId)) {
        throw refuse(404, SAVED_ITEM_NOT_FOUND);
      }
      saved = {
        ...base,
        kind: 'route',
        lineId: draft.lineId,
        patternId: draft.patternId,
        routeShortName: line.routeShortName,
        routeLongName: line.routeLongName,
      };
      break;
    }
    case 'itinerary': {
      // Rounded as the server stores them, so identity matches either way.
      const place = (p: FavouritePlace): FavouritePlace => ({
        label: p.label,
        lat: roundCoordinate(p.lat),
        lon: roundCoordinate(p.lon),
      });
      saved = {
        ...base,
        kind: 'itinerary',
        origin: place(draft.origin),
        destination: place(draft.destination),
        pace: draft.pace,
      };
      break;
    }
  }

  // Read again: the line lookup above may have taken a moment, and another
  // tab may have saved meanwhile.
  const latest = read();
  if (latest.some((item) => identity(item) === key)) throw refuse(400, ALREADY_SAVED);
  const next = [...latest, saved];
  write(next);
  return grouped(next);
}

export async function renameGuestItem(
  kind: FavouriteKind,
  itemId: string,
  nickname: string,
): Promise<SavedItems> {
  const name = nickname.trim();
  if (name === '') throw refuse(400, 'INVALID_SUBMISSION');

  const items = read();
  if (!items.some((item) => item.kind === kind && item.id === itemId)) {
    throw refuse(404, SAVED_ITEM_NOT_FOUND);
  }
  const taken = items.some(
    (item) =>
      item.kind === kind &&
      item.id !== itemId &&
      item.nickname !== null &&
      item.nickname.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw refuse(400, DUPLICATE_NICKNAME);

  const next = items.map((item) =>
    item.kind === kind && item.id === itemId ? { ...item, nickname: name } : item,
  );
  write(next);
  return grouped(next);
}

export async function removeGuestItem(kind: FavouriteKind, itemId: string): Promise<SavedItems> {
  const items = read();
  if (!items.some((item) => item.kind === kind && item.id === itemId)) {
    throw refuse(404, SAVED_ITEM_NOT_FOUND);
  }
  const next = items.filter((item) => !(item.kind === kind && item.id === itemId));
  write(next);
  return grouped(next);
}

/** Drops one row after it has been carried into an account. */
export function forgetGuestItem(item: Favourite): void {
  write(read().filter((stored) => identity(stored) !== identity(item)));
}
