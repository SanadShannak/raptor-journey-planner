import { WALKING_PACES, type WalkingPace } from '../../config/journey';
import type { GtfsRouteType } from '../../types/journey';
import type { Favourite, FavouritePlace } from './favourite';

/**
 * Where favourites are kept, and the only module that knows.
 *
 * **This is the seam.** Nothing else in the feature touches `localStorage`, so
 * moving favourites onto an account later is a change to this file plus a
 * loading state in the store — not a rewrite of the rows, the star, or the
 * page. That is the whole reason it is a module of its own rather than four
 * lines inside the store.
 *
 * Device-local, deliberately, and the interface says so out loud: sign-in is
 * inert in this app, so anything implying favourites follow a person between
 * devices would be a promise the product cannot keep.
 *
 * Everything here is defensive in a way the rest of the app is not, and for a
 * specific reason: `localStorage` is user-editable, survives deploys, and is
 * the one input to this app that a future version of this app will have
 * written. So the envelope is versioned, every field is checked on the way in,
 * and **anything unrecognised resolves to an empty list rather than throwing**
 * — the same discipline `fromSearchParams` applies to the address bar.
 */

const STORAGE_KEY = 'favourites';

/** Bump when the shape changes; an older or newer envelope reads as empty. */
const VERSION = 1;

interface Envelope {
  version: number;
  items: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asNullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
};

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * A GTFS `route_type` we actually understand.
 *
 * Standard codes only, never the extended three-digit set — the same rule the
 * rest of the app follows. An unrecognised mode drops the whole entry rather
 * than defaulting: a rail platform drawn as a bus stop sends somebody to the
 * wrong side of a station.
 */
const ROUTE_TYPES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 11, 12];

const asRouteType = (value: unknown): GtfsRouteType | null => {
  const numeric = asFiniteNumber(value);
  if (numeric === null || !ROUTE_TYPES.includes(numeric)) return null;
  return numeric as GtfsRouteType;
};

const asPace = (value: unknown): WalkingPace | null => {
  const text = asString(value);
  if (text === null || !Object.hasOwn(WALKING_PACES, text)) return null;
  return text as WalkingPace;
};

/** Off the globe is not a place — the same check the address bar makes. */
function asPlace(value: unknown): FavouritePlace | null {
  if (!isRecord(value)) return null;

  const label = asString(value['label']);
  const lat = asFiniteNumber(value['lat']);
  const lon = asFiniteNumber(value['lon']);

  if (label === null || label === '') return null;
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return { label, lat, lon };
}

/**
 * One entry, or null when it cannot be trusted.
 *
 * A single bad entry is dropped and the rest are kept. Losing every saved stop
 * because one line's `routeType` was hand-edited would be a worse answer than
 * losing the one that was broken.
 */
function parseFavourite(value: unknown): Favourite | null {
  if (!isRecord(value)) return null;

  const nickname = asNullableString(value['nickname']);
  if (nickname === undefined) return null;

  switch (value['kind']) {
    case 'stop': {
      const stopId = asString(value['stopId']);
      const name = asString(value['name']);
      if (stopId === null || stopId === '' || name === null) return null;

      const rawModes = value['modes'];
      if (!Array.isArray(rawModes)) return null;
      const modes: GtfsRouteType[] = [];
      for (const entry of rawModes) {
        const mode = asRouteType(entry);
        if (mode === null) return null;
        modes.push(mode);
      }

      return {
        kind: 'stop',
        nickname,
        stopId,
        name,
        code: asNullableString(value['code']) ?? null,
        modes,
      };
    }

    case 'route': {
      const lineId = asString(value['lineId']);
      const patternId = asFiniteNumber(value['patternId']);
      const routeShortName = asString(value['routeShortName']);
      const routeType = asRouteType(value['routeType']);

      if (lineId === null || lineId === '') return null;
      if (patternId === null || !Number.isInteger(patternId)) return null;
      if (routeShortName === null) return null;
      if (routeType === null) return null;

      const direction = value['directionId'];
      const directionId = direction === 0 || direction === 1 ? direction : null;

      return {
        kind: 'route',
        nickname,
        lineId,
        patternId,
        routeShortName,
        routeType,
        routeLongName: asNullableString(value['routeLongName']) ?? null,
        headsign: asNullableString(value['headsign']) ?? null,
        directionId,
      };
    }

    case 'itinerary': {
      const origin = asPlace(value['origin']);
      const destination = asPlace(value['destination']);
      const pace = asPace(value['pace']);
      if (origin === null || destination === null || pace === null) return null;

      return { kind: 'itinerary', nickname, origin, destination, pace };
    }

    default:
      return null;
  }
}

/**
 * What is on disk.
 *
 * Never throws. A browser that refuses storage — private browsing, a blocked
 * origin — is answered with an empty list, and the app then runs entirely in
 * memory for that session rather than failing to render.
 */
export function readFavourites(): Favourite[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }

  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }

  if (!isRecord(parsed)) return [];
  const envelope = parsed as unknown as Envelope;
  if (envelope.version !== VERSION) return [];
  if (!Array.isArray(envelope.items)) return [];

  const items: Favourite[] = [];
  for (const entry of envelope.items) {
    const favourite = parseFavourite(entry);
    if (favourite !== null) items.push(favourite);
  }

  return items;
}

/**
 * Replaces what is on disk.
 *
 * Failure is swallowed on purpose. A full or refused quota must not take down
 * the press that caused it — the favourite is already in the store, so the
 * session continues correctly and only the persistence is lost.
 */
export function writeFavourites(items: readonly Favourite[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: VERSION, items } satisfies Envelope),
    );
  } catch {
    /* Nothing useful to do, and nothing worth breaking the page over. */
  }
}

/** Which key a `storage` event has to name for it to be ours. */
export const FAVOURITES_STORAGE_KEY = STORAGE_KEY;
