import { paths } from '../../app/routes';
import type { NetworkMoment } from '../stops/minutesUntil';
import type { ItineraryFavourite } from './favourite';

/**
 * Where a saved journey goes when it is pressed.
 *
 * The planner already runs a search it finds in its address — that is what the
 * URL search params are for, and the restore effect there runs one exactly
 * once, gated on the health probe. So opening a favourite needs no new
 * machinery at all: build the address the planner already understands, and it
 * searches on arrival.
 *
 * **The date and time are always now**, which is the whole point of saving a
 * journey rather than a result. They come from the network's clock, never the
 * browser's — a visitor in Amman opening a saved Helsinki commute is asking
 * what runs *there*, now.
 *
 * The parameter names and coordinate precision mirror `toSearchParams`
 * exactly. They are written here rather than by calling it because that
 * function takes a whole `JourneyFormValues` — with `Place` objects a favourite
 * deliberately does not keep — and reconstructing two of those in order to
 * serialise six numbers would be the longer way round to the same string.
 */

/** The same precision the address bar uses everywhere else. */
const COORDINATE_PLACES = 6;

const round = (value: number): string => String(Number(value.toFixed(COORDINATE_PLACES)));

export function journeyFavouriteParams(
  favourite: ItineraryFavourite,
  now: NetworkMoment,
): URLSearchParams {
  const params = new URLSearchParams();

  params.set('from', favourite.origin.label);
  params.set('fromLat', round(favourite.origin.lat));
  params.set('fromLon', round(favourite.origin.lon));
  params.set('to', favourite.destination.label);
  params.set('toLat', round(favourite.destination.lat));
  params.set('toLon', round(favourite.destination.lon));
  params.set('date', now.date);
  /*
   * `HH:mm`, which is what the planner reads back. `NetworkMoment.time` is
   * already exactly that — whole minutes, 24-hour, network-local.
   */
  params.set('time', now.time);
  params.set('pace', favourite.pace);

  return params;
}

/**
 * The full address, or null while the network's clock is not known yet.
 *
 * Null rather than a guess: a saved journey opened against the browser's idea
 * of "now" would search the wrong moment in every city but one.
 */
export function journeyFavouritePath(
  favourite: ItineraryFavourite,
  now: NetworkMoment | null,
): string | null {
  if (now === null) return null;
  return `${paths.home}?${journeyFavouriteParams(favourite, now).toString()}`;
}
