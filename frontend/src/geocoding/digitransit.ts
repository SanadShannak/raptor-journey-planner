import type { GtfsRouteType } from '../types/journey';
import type {
  Geocoder,
  Place,
  PlaceKind,
  PlaceSearchOptions,
} from '../types/place';

/**
 * Digitransit — Finland's transit geocoder, used when a subscription key is
 * configured.
 *
 * Worth the key because it knows the transit network, not just the map: its
 * results include HSL's own stops, so a search for "Lasipalatsi" offers the
 * stop rather than only the building. That is what lets the form show stations
 * alongside addresses without the frontend shipping a stop index or the
 * backend growing a search endpoint.
 *
 * The service returns 401 without a key — registration is free at
 * https://portal-api.digitransit.fi. Without one, the app falls back to Photon.
 *
 * The response shape below was read off live responses for `Lasipalatsi` and
 * `Pasila`, which between them cover a venue, a station, and six rail
 * platforms. Everything is still read defensively: a field that turns out to be
 * shaped differently costs a result its stop detail rather than breaking the
 * search.
 */

/**
 * Pelias offers two query endpoints, and neither one answers well alone.
 *
 * `autocomplete` treats the final word as a prefix, which is what makes a
 * search box feel live: "Kump" already offers Kumpula. What it will not do is
 * match across a name's language variants — every token has to hit the same
 * indexed name — so "Kumpula Campus" returns *nothing at all*, because the
 * place is indexed in Finnish as "Kumpulan kampus" with the English name only
 * in a secondary field. Typing the name of a place in the wrong one of the
 * city's two languages is not an unusual thing to do.
 *
 * `search` matches the full text properly and finds it, but has no notion of a
 * prefix: "Kump" reaches Kumputie in Espoo and never Kumpula.
 *
 * So the fast one is asked first, and the thorough one only when it came back
 * empty-handed — which costs a second round trip exactly when the alternative
 * was showing the visitor nothing.
 */
const AUTOCOMPLETE_ENDPOINT = 'https://api.digitransit.fi/geocoding/v1/autocomplete';
const SEARCH_ENDPOINT = 'https://api.digitransit.fi/geocoding/v1/search';

/** Pelias layers that mean "somewhere a vehicle calls". */
const STOP_LAYERS = new Set(['stop', 'station']);

/**
 * The smallest `size` the service accepts.
 *
 * Anything below it is refused with an `out-of-range integer 'size'` warning
 * and silently replaced by this value, so asking for six returns ten. Asked
 * for honestly here and trimmed on our side, which is the only way the caller's
 * `limit` actually means anything.
 */
const MIN_REQUEST_SIZE = 10;

/**
 * Digitransit's mode vocabulary, mapped to standard GTFS `route_type`.
 *
 * The names come from OTP rather than from GTFS, which is why `SUBWAY` and
 * `RAIL` need translating at all. Qualified variants — HSL sends
 * `"BUS-EXPRESS"` alongside `"BUS"` — are reduced to their family before the
 * lookup, since the qualifier describes the service, not the vehicle.
 */
const MODE_TYPES: Record<string, GtfsRouteType> = {
  TRAM: 0,
  SUBWAY: 1,
  METRO: 1,
  RAIL: 2,
  BUS: 3,
  FERRY: 4,
  CABLE_CAR: 5,
  GONDOLA: 6,
  FUNICULAR: 7,
  TROLLEYBUS: 11,
  MONORAIL: 12,
};

interface DigitransitFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

/** The transit block Digitransit hangs off a stop or station result. */
interface GtfsAddendum {
  modes?: unknown;
  code?: unknown;
  platform?: unknown;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/**
 * Extracts the feed's own stop id from Digitransit's namespaced identifier.
 *
 * Ids arrive as `GTFS:HSL:1020444` — a source, a feed, then the id the feed
 * itself uses. Only the last part matches the ids in our compiled data, and it
 * is taken as "after the last colon" rather than "the third field" because
 * another feed may namespace differently.
 *
 * A platform-level stop appends its code after a hash: `GTFS:HSL:1020444#H0101`
 * is stop `1020444` at platform code `H0101`. That suffix is not part of the
 * id — carrying it through produced `1020444#H0101`, which matches nothing in
 * the feed, so every stop suggestion silently failed to resolve.
 */
function toStopId(rawId: unknown): string | null {
  const id = text(rawId);
  if (id === null) return null;
  const afterNamespace = id.slice(id.lastIndexOf(':') + 1);
  const hash = afterNamespace.indexOf('#');
  const bare = hash === -1 ? afterNamespace : afterNamespace.slice(0, hash);
  return bare.length > 0 ? bare : null;
}

/** The `addendum.GTFS` block, if this result has one. */
function gtfsAddendum(properties: Record<string, unknown>): GtfsAddendum {
  const addendum = properties['addendum'];
  if (typeof addendum !== 'object' || addendum === null) return {};
  const gtfs = (addendum as Record<string, unknown>)['GTFS'];
  if (typeof gtfs !== 'object' || gtfs === null) return {};
  return gtfs as GtfsAddendum;
}

/**
 * Reads `["BUS", "BUS-EXPRESS"]` into a de-duplicated list of route types.
 *
 * Unrecognised names are dropped rather than defaulted, because a wrong icon
 * is worse than the generic one: telling someone a rail platform is a bus stop
 * sends them to the wrong side of the station.
 */
function toRouteTypes(raw: unknown): GtfsRouteType[] {
  if (!Array.isArray(raw)) return [];

  const types: GtfsRouteType[] = [];
  for (const entry of raw) {
    const name = text(entry)?.toUpperCase();
    if (name === undefined || name === null) continue;
    // `BUS-EXPRESS` is a bus; the qualifier describes the service pattern.
    const family = name.split('-')[0] ?? name;
    const type = MODE_TYPES[family];
    if (type !== undefined && !types.includes(type)) types.push(type);
  }
  return types;
}

/**
 * Pelias sends a `label` that already contains the name plus its locality
 * ("Lasipalatsi, Helsinki"). The name is shown on its own line, so the
 * remainder becomes the context rather than repeating.
 */
function contextFor(properties: Record<string, unknown>): string | null {
  const name = text(properties['name']);
  const label = text(properties['label']);

  if (label !== null && name !== null && label.startsWith(`${name},`)) {
    const rest = label.slice(name.length + 1).trim();
    if (rest.length > 0) return rest;
  }

  const parts = [
    text(properties['street']),
    text(properties['neighbourhood']),
    text(properties['localadmin']) ?? text(properties['locality']),
  ].filter((part): part is string => part !== null && part !== name);

  return parts.length > 0 ? parts.slice(0, 2).join(' · ') : (label ?? null);
}

function toPlace(feature: DigitransitFeature, index: number): Place | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties ?? {};

  // GeoJSON is longitude-first.
  const lon = coordinates?.[0];
  const lat = coordinates?.[1];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const label = text(properties['name']) ?? text(properties['label']);
  if (label === null) return null;

  const layer = text(properties['layer']) ?? '';
  const kind: PlaceKind = STOP_LAYERS.has(layer) ? 'stop' : 'place';
  const gtfs = kind === 'stop' ? gtfsAddendum(properties) : {};

  return {
    key: text(properties['gid']) ?? text(properties['id']) ?? String(index),
    lat,
    lon,
    label,
    context: contextFor(properties),
    kind,
    // Only claimed for a stop: an address has an id too, and it means nothing
    // to a timetable.
    stopId: kind === 'stop' ? toStopId(properties['id']) : null,
    stopCode: kind === 'stop' ? text(gtfs.code) : null,
    platform: kind === 'stop' ? text(gtfs.platform) : null,
    // Empty rather than null on a stop whose modes were not reported — the
    // difference is "we do not know what calls here" versus "not a stop".
    modes: kind === 'stop' ? toRouteTypes(gtfs.modes) : null,
  };
}

export function createDigitransitGeocoder(subscriptionKey: string): Geocoder {
  return {
    id: 'digitransit',
    attribution: '© Digitransit · OpenStreetMap contributors',

    async search(query, options: PlaceSearchOptions = {}) {
      const limit = options.limit ?? 6;

      async function ask(endpoint: string): Promise<Place[]> {
        const url = new URL(endpoint);
        url.searchParams.set('text', query);
        url.searchParams.set('size', String(Math.max(limit, MIN_REQUEST_SIZE)));
        if (options.language) url.searchParams.set('lang', options.language);
        if (options.bounds) {
          const { minLat, minLon, maxLat, maxLon } = options.bounds;
          url.searchParams.set('boundary.rect.min_lat', String(minLat));
          url.searchParams.set('boundary.rect.min_lon', String(minLon));
          url.searchParams.set('boundary.rect.max_lat', String(maxLat));
          url.searchParams.set('boundary.rect.max_lon', String(maxLon));
        }

        const response = await fetch(url, {
          signal: options.signal ?? null,
          headers: {
            Accept: 'application/json',
            // Sent as a header rather than a query parameter so the key stays
            // out of anything that logs URLs.
            'digitransit-subscription-key': subscriptionKey,
          },
        });
        if (!response.ok) {
          throw new Error(`Digitransit responded with ${response.status}.`);
        }

        const body: unknown = await response.json();
        const features = (body as { features?: unknown })?.features;
        if (!Array.isArray(features)) return [];

        return features
          .map((feature, index) => toPlace(feature as DigitransitFeature, index))
          .filter((place): place is Place => place !== null)
          .slice(0, limit);
      }

      const suggestions = await ask(AUTOCOMPLETE_ENDPOINT);
      /*
       * Only when there is nothing to show. A short answer is still an answer
       * — the visitor is mid-word and the list is about to change again — and
       * asking twice on every keystroke would double the traffic to a
       * rate-limited key to improve results nobody was waiting on.
       */
      if (suggestions.length > 0) return suggestions;
      return ask(SEARCH_ENDPOINT);
    },
  };
}
