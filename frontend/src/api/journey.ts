/**
 * Journey-planning endpoints.
 *
 * UI code calls these functions; it never sees URLs, query-string assembly, or
 * response parsing.
 */

import type {
  IsoDate,
  Journey,
  JourneyEndpoint,
  JourneyQuery,
} from '../types/journey';
import { getJson, type QueryParams } from './client';
import { ApiError, isNoRouteFound } from './errors';

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
function isJourney(value: unknown): value is Journey {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Journey).legs)
  );
}

/**
 * Normalises the response into a list, whatever shape the engine sends.
 *
 * Today it answers with a single itinerary. It is expected to grow into a list
 * of alternatives, and absorbing both here means that change costs one branch
 * in this function rather than a rewrite of everything that renders results.
 */
function assertJourneys(body: unknown): Journey[] {
  if (Array.isArray(body)) {
    if (!body.every(isJourney)) {
      throw new ApiError(
        'malformed',
        'Journey list contained an entry without legs.',
      );
    }
    return body;
  }

  // A wrapped list, should the engine ever prefer an envelope.
  const wrapped = (body as { journeys?: unknown } | null)?.journeys;
  if (Array.isArray(wrapped)) {
    if (!wrapped.every(isJourney)) {
      throw new ApiError(
        'malformed',
        'Journey list contained an entry without legs.',
      );
    }
    return wrapped;
  }

  if (!isJourney(body)) {
    throw new ApiError(
      'malformed',
      'Journey response did not contain a list of legs.',
    );
  }
  return [body];
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
 * Each endpoint is sent either as a coordinate pair or as a stop id, under
 * `origin`/`dest`-prefixed parameter names.
 */
function endpointParams(
  prefix: 'origin' | 'dest',
  endpoint: JourneyEndpoint,
): QueryParams {
  if (endpoint.type === 'stop') {
    return { [`${prefix}StopId`]: endpoint.stopId };
  }
  return {
    [`${prefix}Lat`]: endpoint.lat,
    [`${prefix}Lon`]: endpoint.lon,
  };
}

/**
 * `GET /api/planner` — plans a door-to-door journey between two endpoints,
 * departing at the given local date and time.
 *
 * Returns a list, which is empty when nothing connects the two places at that
 * time. **That case is not an error.** The engine reports it as a 404 with
 * `NO_ROUTE_FOUND`, but a search that ran correctly and found nothing is an
 * empty result, so it is turned into one here rather than left for every
 * caller to remember to special-case. Genuine failures — a bad date, an origin
 * outside the network, an unreachable server — still reject.
 *
 * This also means the day the engine returns `200` with an empty list instead,
 * nothing downstream changes.
 */
export async function planJourney(
  query: JourneyQuery,
  options: CallOptions = {},
): Promise<Journey[]> {
  try {
    const body = await getJson('/api/planner', {
      signal: options.signal,
      params: {
        ...endpointParams('origin', query.origin),
        ...endpointParams('dest', query.destination),
        date: query.date,
        time: query.time,
        WALKING_SPEED_MPS: query.walkingSpeedMps,
      },
    });
    return assertJourneys(body);
  } catch (error) {
    if (isNoRouteFound(error)) return [];
    throw error;
  }
}
