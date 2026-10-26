import { searchStops } from '../api/stops';
import type { StopMatch } from '../types/stop';
import type { Geocoder, Place, PlaceSearchOptions } from '../types/place';

/**
 * A geocoder that also knows the network's own stops.
 *
 * Photon knows OpenStreetMap — streets, districts, landmarks — but not which
 * of its bus stops are in our feed, so on its own a search for a stop by the
 * name on its sign finds nothing, or finds OpenStreetMap's idea of it with no
 * modes and no timetable behind it. The backend knows every stop and its name
 * in each language the feed carries. This asks both at once and offers one
 * list: stops first, as a stop-aware geocoder like Digitransit does, then
 * places.
 *
 * Stops come with the same `kind: 'stop'`, modes and id that Digitransit's do,
 * so the dropdown draws them with their mode icon and nothing downstream needs
 * to know which source a suggestion came from.
 */

/** How many of the list stops may take while places are also on offer. */
const STOP_SHARE = 3;
/** Asked for more than are shown, because same-named neighbours collapse. */
const STOP_REQUEST = 10;
/**
 * Two stops with the same name this close together are one place to a
 * traveller — the two sides of one road, almost always — and listing both
 * offers a choice nobody can make from the name. The journey is planned from
 * a coordinate either way, and the engine walks to whichever side it needs.
 */
const SAME_PLACE_METERS = 400;
/** An OpenStreetMap stop this close to a feed stop is that stop, listed twice. */
const DUPLICATE_METERS = 150;

/** Close enough at city scale, where these distances are compared. */
function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const latMeters = (a.lat - b.lat) * 111_320;
  const lonMeters = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(latMeters, lonMeters);
}

/**
 * The stop as a suggestion, named in the reader's language when the feed has
 * that name, and in the feed's own otherwise. Whichever name is not the label
 * goes underneath, so a stop found by its Arabic name on the English page still
 * shows what was matched.
 */
export function stopToPlace(stop: StopMatch, language: string | undefined): Place {
  const translated = language === undefined ? undefined : stop.translations[language];
  const label = translated ?? stop.name;
  const other = translated === undefined ? Object.values(stop.translations)[0] : stop.name;

  return {
    key: `stop-${stop.id}`,
    lat: stop.lat,
    lon: stop.lon,
    label,
    context: other !== undefined && other !== label ? other : null,
    kind: 'stop',
    stopId: stop.id,
    stopCode: stop.code,
    platform: stop.platform,
    modes: stop.modes,
  };
}

/** Drops a stop that repeats a nearby one's name; the first, best-ranked, stays. */
function collapseNeighbours(places: Place[]): Place[] {
  const kept: Place[] = [];
  for (const place of places) {
    const repeat = kept.some(
      (other) =>
        other.label.toLocaleLowerCase() === place.label.toLocaleLowerCase() &&
        metersBetween(other, place) <= SAME_PLACE_METERS,
    );
    if (!repeat) kept.push(place);
  }
  return kept;
}

export function withFeedStops(places: Geocoder): Geocoder {
  return {
    id: `${places.id}+stops`,
    attribution: places.attribution,

    async search(query, options: PlaceSearchOptions = {}) {
      const limit = options.limit ?? 6;
      const [stopAnswer, placeAnswer] = await Promise.allSettled([
        searchStops(query, { signal: options.signal, limit: STOP_REQUEST }),
        places.search(query, options),
      ]);

      /*
       * Half an answer is still worth showing, but not as "nothing matches":
       * with one source down, an empty list from the other says nothing about
       * whether the place exists. That is the outage, and is reported as one.
       */
      if (stopAnswer.status === 'rejected' && placeAnswer.status === 'rejected') {
        throw placeAnswer.reason;
      }
      const stops =
        stopAnswer.status === 'fulfilled'
          ? collapseNeighbours(stopAnswer.value.map((stop) => stopToPlace(stop, options.language)))
          : [];
      const found = placeAnswer.status === 'fulfilled' ? placeAnswer.value : [];
      if (stops.length === 0 && found.length === 0) {
        if (stopAnswer.status === 'rejected') throw stopAnswer.reason;
        if (placeAnswer.status === 'rejected') throw placeAnswer.reason;
      }

      const others = found.filter(
        (place) =>
          place.kind !== 'stop' ||
          !stops.some((stop) => metersBetween(stop, place) <= DUPLICATE_METERS),
      );

      // Stops keep their share, and take more of the list when places are few.
      const stopCount = Math.min(stops.length, Math.max(STOP_SHARE, limit - others.length));
      return [...stops.slice(0, stopCount), ...others].slice(0, limit);
    },

    ...(places.reverse ? { reverse: places.reverse.bind(places) } : {}),
  };
}
