import { WALKING_PACES, type WalkingPace } from '../../config/journey';
import type { Place } from '../../types/place';
import type { JourneyFormValues } from './journeySearch';

/**
 * A search, written into the address bar and read back out of it.
 *
 * This reverses a decision the planner made deliberately, and the reversal is
 * worth as much explanation as the original was. The search used to live in the
 * URL; it was taken out because the cost — a query string of coordinates and
 * labels on screen for the whole session — bought only a shareable link that
 * nobody was asking for.
 *
 * What changed is that the planner now has somewhere to go. An itinerary leg
 * opens the run it is riding, and a drawn line on the map does the same; both
 * leave the page. With no search in the URL, coming back landed on an empty
 * form and the journey somebody had just planned was gone. A back button that
 * does not work is a much larger cost than a long address.
 *
 * **Only what the search actually depends on.** Coordinates and a label per
 * end, the date, the time, and the pace. A place's context line, stop code and
 * platform are not carried: they are how a suggestion was described when it was
 * picked, not part of the question, and restoring a search is not the same as
 * restoring the moment of choosing it.
 */

/** Long enough to be unambiguous, short enough not to fill the address bar. */
const COORDINATE_PLACES = 6;

const round = (value: number): string => String(Number(value.toFixed(COORDINATE_PLACES)));

/**
 * A place rebuilt from a URL.
 *
 * `kind` is always `'place'` and `stopId` always null, whatever was originally
 * picked. The planner sends coordinates for both — it has never used a stop id
 * — so nothing about the search changes, and claiming a restored place is a
 * stop when the feed was never asked would be inventing a fact.
 */
function placeFromParams(
  params: URLSearchParams,
  prefix: 'from' | 'to',
): Place | null {
  const label = params.get(prefix);
  const lat = Number(params.get(`${prefix}Lat`));
  const lon = Number(params.get(`${prefix}Lon`));

  if (label === null || label === '') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Off the globe is not a place. A truncated or edited URL should fall back to
  // an empty field rather than to a search of the Atlantic.
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return {
    key: `${prefix}:${lat},${lon}`,
    lat,
    lon,
    label,
    context: null,
    kind: 'place',
    stopId: null,
    stopCode: null,
    platform: null,
    modes: null,
  };
}

const isPace = (value: string | null): value is WalkingPace =>
  value !== null && Object.hasOwn(WALKING_PACES, value);

/**
 * The search as query parameters, or an empty set when there is nothing to say.
 *
 * A half-filled form writes nothing. The address is a record of a search that
 * was run, not a running transcript of the form — a URL that changed on every
 * keystroke would fill the history with states nobody chose to be in.
 */
export function toSearchParams(values: JourneyFormValues): URLSearchParams {
  const params = new URLSearchParams();
  const { origin, destination } = values;
  if (origin === null || destination === null) return params;

  params.set('from', origin.label);
  params.set('fromLat', round(origin.lat));
  params.set('fromLon', round(origin.lon));
  params.set('to', destination.label);
  params.set('toLat', round(destination.lat));
  params.set('toLon', round(destination.lon));
  params.set('date', values.date);
  params.set('time', values.time);
  params.set('pace', values.pace);

  return params;
}

/**
 * A search read back out of the address, or null when there is not one there.
 *
 * Null for anything incomplete, rather than a partly-filled form. A search
 * missing an end cannot be run, and a form that half-fills itself from a
 * mangled link is harder to correct than an empty one — the reader has to work
 * out which half they are looking at.
 */
export function fromSearchParams(
  params: URLSearchParams,
  fallbackPace: WalkingPace,
): JourneyFormValues | null {
  const origin = placeFromParams(params, 'from');
  const destination = placeFromParams(params, 'to');
  const date = params.get('date') ?? '';
  const time = params.get('time') ?? '';

  if (origin === null || destination === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const pace = params.get('pace');

  return {
    origin,
    destination,
    date,
    time,
    // An unrecognised pace is the one field worth keeping the search for: it
    // does not change where or when, only how fast the walking is reckoned.
    pace: isPace(pace) ? pace : fallbackPace,
  };
}
