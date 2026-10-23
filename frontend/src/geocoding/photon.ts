import type {
  Geocoder,
  Place,
  PlaceKind,
  PlaceSearchOptions,
} from '../types/place';

/**
 * Photon — OpenStreetMap geocoding, no API key.
 *
 * Chosen as the default because it is one of the few free geocoders that
 * permits typeahead use. Nominatim, the obvious alternative, names
 * auto-complete under "strictly forbidden" in its usage policy, so it cannot
 * back a search box however well it answers a single query.
 *
 * It covers every network this app might load — verified against both Helsinki
 * and Amman. Asked in no particular language it answers in each place's own,
 * which in Jordan is Arabic: exactly what the Arabic interface wants, and the
 * only way to get it, because Photon refuses `lang=ar` outright (see
 * {@link PHOTON_LANGUAGES}).
 *
 * What it does not know is which of its results are stops in *our* feed. It
 * returns OpenStreetMap's idea of a bus stop or station, with no GTFS id, so
 * `stopId` stays null and such results are shown as places. A network with a
 * transit-aware geocoder gets better than this; see `digitransit.ts`.
 */

const ENDPOINT = 'https://photon.komoot.io/api/';
const REVERSE_ENDPOINT = 'https://photon.komoot.io/reverse';

/**
 * The only values komoot's Photon accepts for `lang`.
 *
 * Anything else — `ar` included — is answered with a 400, which used to take
 * place search down for the whole Arabic interface. Any other language is
 * therefore left out of the request, and Photon falls back to local names.
 */
const PHOTON_LANGUAGES = new Set(['en', 'de', 'fr']);

/**
 * How many more results to ask for than will be shown, when some are going to
 * be dropped for being in the wrong country. Near a border most of an Arabic
 * query's matches can be next door; asking for exactly six would often leave
 * one or two.
 */
const OVERFETCH = 4;

/** A Photon instance kept to some countries, or unfiltered. */
export interface PhotonOptions {
  /** ISO 3166-1 alpha-2 codes; null or absent keeps every result. */
  countries?: readonly string[] | null | undefined;
}

/**
 * OpenStreetMap values that mean "public transport stop".
 *
 * Deliberately narrow. A `railway=rail` result is a stretch of track, not a
 * place to wait, and calling it a stop would put a station marker on open line.
 */
const STOP_VALUES = new Set([
  'bus_stop',
  'tram_stop',
  'station',
  'halt',
  'subway_entrance',
  'ferry_terminal',
  'bus_station',
]);

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/**
 * Everything that is not the name, joined into one line of context.
 *
 * Photon spreads location across several optional fields and fills different
 * ones for different result types, so they are collected in decreasing
 * specificity and the empty ones simply drop out.
 */
function contextFor(properties: Record<string, unknown>): string | null {
  const parts = [
    text(properties['street']),
    text(properties['district']),
    text(properties['city']),
    text(properties['state']),
    text(properties['country']),
  ].filter((part): part is string => part !== null);

  // A name repeated as its own city adds nothing: "Helsinki — Helsinki".
  const name = text(properties['name']);
  const unique = parts.filter((part) => part !== name);

  return unique.length > 0 ? unique.slice(0, 2).join(' · ') : null;
}

function toPlace(feature: PhotonFeature, index: number): Place | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties ?? {};

  // GeoJSON orders coordinates longitude-first, which is the reverse of how
  // every other part of this app carries them.
  const lon = coordinates?.[0];
  const lat = coordinates?.[1];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const label = text(properties['name']) ?? text(properties['street']);
  if (label === null) return null;

  const osmValue = text(properties['osm_value']) ?? '';
  const kind: PlaceKind = STOP_VALUES.has(osmValue) ? 'stop' : 'place';

  return {
    key: `${text(properties['osm_type']) ?? 'x'}${String(properties['osm_id'] ?? index)}`,
    lat,
    lon,
    label,
    context: contextFor(properties),
    kind,
    // Photon knows OpenStreetMap, not our feed, so it cannot supply a stop id
    // even when it has correctly identified a stop — nor a stop code, a
    // platform, or which modes call there. A stop it recognises therefore gets
    // the generic stop marker; see `digitransit.ts` for the richer version.
    stopId: null,
    stopCode: null,
    platform: null,
    modes: kind === 'stop' ? [] : null,
  };
}

function setLanguage(url: URL, language: string | undefined) {
  if (language && PHOTON_LANGUAGES.has(language)) {
    url.searchParams.set('lang', language);
  }
}

export function createPhotonGeocoder(
  photonOptions: PhotonOptions = {},
): Geocoder {
  const countries = photonOptions.countries
    ? new Set(photonOptions.countries.map((code) => code.toUpperCase()))
    : null;

  /*
   * Photon has no country filter of its own, so this is done on the answer.
   * A result with no country code is dropped too: it cannot be shown to be
   * inside the network, and a journey to it would be a guess.
   */
  const inCountry = (feature: PhotonFeature): boolean => {
    if (countries === null) return true;
    const code = text(feature.properties?.['countrycode']);
    return code !== null && countries.has(code.toUpperCase());
  };

  return {
    id: 'photon',
    attribution: '© OpenStreetMap contributors · Photon',

    async search(query, options: PlaceSearchOptions = {}) {
      const limit = options.limit ?? 6;
      const url = new URL(ENDPOINT);
      url.searchParams.set('q', query);
      url.searchParams.set(
        'limit',
        String(countries === null ? limit : limit * OVERFETCH),
      );
      setLanguage(url, options.language);
      if (options.bounds) {
        // Photon takes the box corner-first as lon,lat pairs.
        const { minLon, maxLat, maxLon, minLat } = options.bounds;
        url.searchParams.set('bbox', `${minLon},${maxLat},${maxLon},${minLat}`);
      }

      const response = await fetch(url, {
        signal: options.signal ?? null,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Photon responded with ${response.status}.`);
      }

      const body: unknown = await response.json();
      const features = (body as { features?: unknown })?.features;
      if (!Array.isArray(features)) return [];

      return (features as PhotonFeature[])
        .filter(inCountry)
        .map((feature, index) => toPlace(feature, index))
        .filter((place): place is Place => place !== null)
        .slice(0, limit);
    },

    async reverse(latitude, longitude, options: PlaceSearchOptions = {}) {
      const url = new URL(REVERSE_ENDPOINT);
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('lon', String(longitude));
      url.searchParams.set('limit', '1');
      setLanguage(url, options.language);

      const response = await fetch(url, {
        signal: options.signal ?? null,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Photon responded with ${response.status}.`);
      }

      const body: unknown = await response.json();
      const features = (body as { features?: unknown })?.features;
      if (!Array.isArray(features)) return null;

      // A spot over the border is not somewhere this network goes, so it is
      // left unnamed rather than named as a place in another country.
      const nearest = features[0] as PhotonFeature | undefined;
      if (nearest === undefined || !inCountry(nearest)) return null;

      /*
       * The place the service names, at the coordinates that were *pressed*.
       * Its own coordinates are the centre of whatever it matched — a whole
       * park, sometimes — and moving the pin there would answer a question
       * nobody asked.
       */
      const named = toPlace(nearest, 0);
      return named === null ? null : { ...named, lat: latitude, lon: longitude };
    },
  };
}
