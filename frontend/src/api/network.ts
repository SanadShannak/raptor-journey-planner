/**
 * `GET /api/network` — what network is loaded and what its data supports.
 */

import type { NetworkCapabilities, NetworkInfo } from '../types/network';
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
};

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
    feedStartDate: info.feedStartDate ?? null,
    feedEndDate: info.feedEndDate ?? null,
    capabilities: { ...NO_CAPABILITIES, ...(info.capabilities ?? {}) },
  };
}
