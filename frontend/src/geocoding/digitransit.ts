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
 * A caveat worth stating plainly: the response shape below follows the
 * published Pelias/Digitransit documentation but has not been exercised
 * against a live key here. Everything is therefore read defensively, so a
 * field that turns out to be shaped differently costs a result its stop
 * marker rather than breaking the search.
 */

const ENDPOINT = 'https://api.digitransit.fi/geocoding/v1/autocomplete';

/** Pelias layers that mean "somewhere a vehicle calls". */
const STOP_LAYERS = new Set(['stop', 'station']);

interface DigitransitFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/**
 * Extracts the feed's own stop id from Digitransit's namespaced identifier.
 *
 * Ids arrive as `GTFS:HSL:1020444` — a source, a feed, then the id the feed
 * itself uses. Only the last part matches `gtfs_id` in our compiled data, and
 * it is the last part rather than the third because another feed may namespace
 * differently.
 */
function toStopId(rawId: unknown): string | null {
  const id = text(rawId);
  if (id === null) return null;
  const last = id.slice(id.lastIndexOf(':') + 1);
  return last.length > 0 ? last : null;
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
  };
}

export function createDigitransitGeocoder(subscriptionKey: string): Geocoder {
  return {
    id: 'digitransit',
    attribution: '© Digitransit · OpenStreetMap contributors',

    async search(query, options: PlaceSearchOptions = {}) {
      const url = new URL(ENDPOINT);
      url.searchParams.set('text', query);
      url.searchParams.set('size', String(options.limit ?? 6));
      if (options.language) url.searchParams.set('lang', options.language);

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
        .filter((place): place is Place => place !== null);
    },
  };
}
