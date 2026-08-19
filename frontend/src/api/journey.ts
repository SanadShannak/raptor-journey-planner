/**
 * Journey-planning endpoints.
 *
 * UI code calls these functions; it never sees URLs, query-string assembly, or
 * response parsing.
 */

import type { IsoDate, Journey, JourneyQuery } from '../types/journey';
import { getJson } from './client';
import { ApiError } from './errors';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/**
 * The responses are trusted rather than fully validated — these checks only
 * catch a server that is answering with something structurally different
 * (a proxy error page, a different service), which would otherwise surface far
 * from its cause. A schema validator would be the answer if the API grows
 * genuinely variable payloads.
 */
function assertJourney(body: unknown): Journey {
  const journey = body as Journey;
  if (typeof journey !== 'object' || journey === null || !Array.isArray(journey.legs)) {
    throw new ApiError('malformed', 'Journey response did not contain a list of legs.');
  }
  return journey;
}

function assertIsoDateArray(body: unknown): IsoDate[] {
  if (!Array.isArray(body) || body.some((entry) => typeof entry !== 'string')) {
    throw new ApiError('malformed', 'Valid-dates response was not a list of dates.');
  }
  return body as IsoDate[];
}

/**
 * `GET /api/valid-dates` — the dates the loaded timetable data covers.
 * Returned in ascending order.
 */
export async function getValidDates(options: CallOptions = {}): Promise<IsoDate[]> {
  const body = await getJson('/api/valid-dates', { signal: options.signal });
  return assertIsoDateArray(body);
}

/**
 * `GET /api/route` — plans a door-to-door journey between two coordinates,
 * departing at the given local date and time.
 *
 * Throws an {@link ApiError} with `kind: 'http'` when no journey exists; the
 * backend's `errorCode` is carried on `error.code`.
 */
export async function planJourney(
  query: JourneyQuery,
  options: CallOptions = {},
): Promise<Journey> {
  const body = await getJson('/api/route', {
    signal: options.signal,
    params: {
      originLat: query.origin.lat,
      originLon: query.origin.lon,
      destLat: query.destination.lat,
      destLon: query.destination.lon,
      date: query.date,
      time: query.time,
    },
  });
  return assertJourney(body);
}
