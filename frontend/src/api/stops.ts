import { getJson } from './client';
import type { GeoBounds } from '../config/geocoding';
import type { GtfsRouteType } from '../types/journey';
import type { NetworkStop } from '../types/stop';

/**
 * The stops inside an area.
 *
 * For the map, which cannot ask for a network's worth of stops and does not
 * need to — it draws what is on screen. The backend answers from the spatial
 * grid the routing engine already keeps in memory, so the cost follows the size
 * of the box rather than the size of the feed.
 *
 * The answer is capped rather than paged. A map asks this again on every pan,
 * so an answer that arrives late is worth less than one that arrives small, and
 * a client that wants more detail asks for a smaller box — which is what
 * zooming in is. `truncated` says when the cap was reached, so nothing has to
 * infer it from the count.
 */
export interface StopsInBounds {
  stops: NetworkStop[];
  truncated: boolean;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** Standard GTFS route types only; anything else is dropped rather than kept. */
function toModes(raw: unknown): GtfsRouteType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is GtfsRouteType => typeof value === 'number' && Number.isFinite(value),
  );
}

function toStop(raw: unknown): NetworkStop | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const id = text(record['id']);
  const lat = record['lat'];
  const lon = record['lon'];
  // A stop with no id cannot be asked about, and one with no position cannot
  // be drawn. Either way it is not a stop this layer can use.
  if (id === null || typeof lat !== 'number' || typeof lon !== 'number') return null;

  return {
    id,
    name: text(record['name']) ?? id,
    code: text(record['code']),
    lat,
    lon,
    description: text(record['description']),
    fareZone: text(record['fareZone']),
    wheelchairAccessible:
      typeof record['wheelchairAccessible'] === 'boolean'
        ? record['wheelchairAccessible']
        : null,
    modes: toModes(record['modes']),
  };
}

export async function getStopsInBounds(
  bounds: GeoBounds,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<StopsInBounds> {
  const body = await getJson('/api/stops', {
    params: {
      minLat: bounds.minLat,
      minLon: bounds.minLon,
      maxLat: bounds.maxLat,
      maxLon: bounds.maxLon,
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const record = (body ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(record['stops']) ? record['stops'] : [];

  return {
    stops: raw.map(toStop).filter((stop): stop is NetworkStop => stop !== null),
    truncated: record['truncated'] === true,
  };
}
