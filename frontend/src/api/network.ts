/**
 * `GET /api/network` — what network is loaded and what its data supports.
 */

import type { GtfsRouteType } from '../types/journey';
import type { NetworkCapabilities, NetworkInfo, ServiceArea } from '../types/network';
import { getJson } from './client';
import { ApiError } from './errors';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/**
 * Every capability defaults to false.
 *
 * A missing flag and a false one mean the same thing to a caller — do not
 * render UI for this — so filling the gaps here means no component has to ask
 * whether it is allowed to ask.
 */
const NO_CAPABILITIES: NetworkCapabilities = {
  stopCode: false,
  stopDescription: false,
  fareZones: false,
  wheelchairAccessibility: false,
  routeLongName: false,
  routeDirection: false,
  routeHeadsign: false,
  tripHeadsign: false,
  routeShape: false,
  transitDistance: false,
  platforms: false,
};

/** Standard GTFS route types only; anything else is dropped rather than kept. */
function toModes(raw: unknown): GtfsRouteType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is GtfsRouteType =>
      typeof value === 'number' && Number.isFinite(value),
  );
}

export async function getNetwork(options: CallOptions = {}): Promise<NetworkInfo> {
  const body = await getJson('/api/network', { signal: options.signal });
  const info = body as Partial<NetworkInfo> | null;

  if (typeof info !== 'object' || info === null || typeof info.timezone !== 'string') {
    throw new ApiError('malformed', 'Network response did not state a timezone.');
  }

  return {
    network: info.network ?? 'unknown',
    timezone: info.timezone,
    language: info.language ?? null,
    agencyName: info.agencyName ?? null,
    publisherName: info.publisherName ?? null,
    currency: typeof info.currency === 'string' && info.currency !== '' ? info.currency : null,
    feedStartDate: info.feedStartDate ?? null,
    feedEndDate: info.feedEndDate ?? null,
    capabilities: { ...NO_CAPABILITIES, ...(info.capabilities ?? {}) },
    // Empty for a backend that predates the field, which is the same thing it
    // means for a feed with no routes: offer no mode filter.
    modes: toModes(info.modes),
  };
}

const isPosition = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  Number.isFinite(value[0]) &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[1]);

/**
 * `GET /api/network/area` — where a journey can start or end.
 *
 * Null when the network has no area to draw (a feed with no served stops). A
 * ring with a malformed point is dropped whole rather than drawn with a gap,
 * and a polygon whose outer ring went with it is dropped too.
 */
export async function getServiceArea(options: CallOptions = {}): Promise<ServiceArea | null> {
  const body = await getJson('/api/network/area', { signal: options.signal });
  const geometry = (body as { geometry?: unknown } | null)?.geometry as
    | { type?: unknown; coordinates?: unknown }
    | null
    | undefined;

  if (geometry === null || geometry === undefined) return null;
  if (geometry.type !== 'MultiPolygon' || !Array.isArray(geometry.coordinates)) {
    throw new ApiError('malformed', 'Service area response was not a MultiPolygon.');
  }

  const polygons: [number, number][][][] = [];
  for (const rawPolygon of geometry.coordinates as unknown[]) {
    if (!Array.isArray(rawPolygon)) continue;
    const rings = rawPolygon.filter(
      (ring): ring is [number, number][] =>
        Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition),
    );
    if (rings.length > 0 && rings[0] === rawPolygon[0]) polygons.push(rings);
  }

  return polygons.length === 0 ? null : { polygons };
}
