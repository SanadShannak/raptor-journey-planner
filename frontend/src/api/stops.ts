/**
 * Stop endpoints — the stops in an area, one stop's live board, and one
 * stop's whole day.
 *
 * UI code calls these functions; it never sees URLs, query-string assembly, or
 * response parsing.
 */

import { getJson } from './client';
import { ApiError } from './errors';
import type { GeoBounds } from '../config/geocoding';
import type { GtfsRouteType, IsoDate } from '../types/journey';
import type {
  NetworkStop,
  ScheduleHour,
  ServingLine,
  StopBoard,
  StopDeparture,
  StopIdentity,
  StopTimetable,
} from '../types/stop';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

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

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Standard GTFS route types only; anything else is dropped rather than kept. */
function toModes(raw: unknown): GtfsRouteType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is GtfsRouteType => typeof value === 'number' && Number.isFinite(value),
  );
}

const toDirection = (raw: unknown): 0 | 1 | null =>
  raw === 0 || raw === 1 ? raw : null;

/**
 * The stop itself.
 *
 * Null when it has no id or no position: one cannot be asked about and the
 * other cannot be drawn. The optional fields are read defensively rather than
 * assumed present, because the backend's own fallback branch omits them
 * entirely rather than sending nulls.
 */
function toStopIdentity(raw: unknown): StopIdentity | null {
  const stop = record(raw);
  if (stop === null) return null;

  const id = text(stop['id']);
  const lat = stop['lat'];
  const lon = stop['lon'];
  if (id === null || typeof lat !== 'number' || typeof lon !== 'number') return null;

  return {
    id,
    name: text(stop['name']) ?? id,
    code: text(stop['code']),
    platform: text(stop['platform']),
    lat,
    lon,
    description: text(stop['description']),
    fareZone: text(stop['fareZone']),
    wheelchairAccessible:
      typeof stop['wheelchairAccessible'] === 'boolean'
        ? stop['wheelchairAccessible']
        : null,
  };
}

function toNetworkStop(raw: unknown): NetworkStop | null {
  const stop = toStopIdentity(raw);
  if (stop === null) return null;
  return { ...stop, modes: toModes((raw as Record<string, unknown>)['modes']) };
}

function toServingLine(raw: unknown): ServingLine | null {
  const line = record(raw);
  if (line === null) return null;

  const lineId = text(line['lineId']);
  const routeType = line['routeType'];
  if (lineId === null || typeof routeType !== 'number') return null;

  const destinations = Array.isArray(line['destinations'])
    ? line['destinations'].filter((value): value is string => typeof value === 'string')
    : [];

  return {
    lineId,
    routeShortName: text(line['routeShortName']) ?? lineId,
    routeType: routeType as GtfsRouteType,
    routeLongName: text(line['routeLongName']),
    directionId: toDirection(line['directionId']),
    destinations,
  };
}

/**
 * One departure.
 *
 * A row with no time cannot be placed on a board, so it is dropped rather than
 * rendered as a blank line. Everything else degrades: an unnamed destination
 * reads as null and the row says "towards" nothing rather than disappearing.
 */
function toDeparture(raw: unknown): StopDeparture | null {
  const departure = record(raw);
  if (departure === null) return null;

  const date = text(departure['date']);
  const time = text(departure['time']);
  const routeType = departure['routeType'];
  if (date === null || time === null || typeof routeType !== 'number') return null;

  const terminatesHere = departure['terminatesHere'] === true;

  return {
    date,
    time,
    arrivalDate: text(departure['arrivalDate']) ?? date,
    arrivalTime: text(departure['arrivalTime']) ?? time,
    lineId: text(departure['lineId']) ?? '',
    routeShortName: text(departure['routeShortName']) ?? '',
    routeType: routeType as GtfsRouteType,
    headsign: text(departure['headsign']),
    // The contract ties these together; honouring it here means no component
    // has to hold both rules in its head to render one row.
    destination: terminatesHere ? null : text(departure['destination']),
    terminatesHere,
    tripId: text(departure['tripId']),
    directionId: toDirection(departure['directionId']),
    routeLongName: text(departure['routeLongName']),
  };
}

const isPresent = <T,>(value: T | null): value is T => value !== null;

const toServingLines = (raw: unknown): ServingLine[] =>
  Array.isArray(raw) ? raw.map(toServingLine).filter(isPresent) : [];

const toDepartures = (raw: unknown): StopDeparture[] =>
  Array.isArray(raw) ? raw.map(toDeparture).filter(isPresent) : [];

/**
 * The stop every response is built around.
 *
 * Its absence is the one thing that cannot be recovered from — without it there
 * is nothing to put a heading on — so it is the only malformed-response throw
 * in this module.
 */
function requireStop(body: Record<string, unknown> | null, what: string): StopIdentity {
  const stop = toStopIdentity(body?.['stop']);
  if (stop === null) {
    throw new ApiError('malformed', `${what} response did not describe a stop.`);
  }
  return stop;
}

export async function getStopsInBounds(
  bounds: GeoBounds,
  options: CallOptions = {},
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

  const answer = record(body) ?? {};
  const raw = Array.isArray(answer['stops']) ? answer['stops'] : [];

  return {
    stops: raw.map(toNetworkStop).filter(isPresent),
    truncated: answer['truncated'] === true,
  };
}

/**
 * `GET /api/stop/:id` — what leaves next, measured from the network's clock
 * rather than the browser's.
 *
 * `limit` is clamped to 1–200 by the backend and defaults to 20. There is no
 * "there are more" flag on the answer, so a caller wanting to know whether it
 * saw everything must compare the count against what it asked for.
 */
export async function getStopBoard(
  stopId: string,
  options: CallOptions & { limit?: number | undefined } = {},
): Promise<StopBoard> {
  const body = await getJson(`/api/stop/${encodeURIComponent(stopId)}`, {
    ...(options.limit === undefined ? {} : { params: { limit: options.limit } }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const answer = record(body);
  const asOf = record(answer?.['asOf']);

  return {
    stop: requireStop(answer, 'Stop board'),
    asOf: {
      date: text(asOf?.['date']) ?? '',
      time: text(asOf?.['time']) ?? '',
    },
    servingLines: toServingLines(answer?.['servingLines']),
    departures: toDepartures(answer?.['departures']),
  };
}

/**
 * `GET /api/stop/:id/timetable?date=` — a whole service day.
 *
 * The hours arrive as an ordered list and are kept as one. Re-keying them by
 * hour would hoist `"10"`–`"23"` ahead of `"07"` and scramble the board, which
 * is the reason the backend does not send an object either.
 */
export async function getStopTimetable(
  stopId: string,
  date: IsoDate,
  options: CallOptions = {},
): Promise<StopTimetable> {
  const body = await getJson(`/api/stop/${encodeURIComponent(stopId)}/timetable`, {
    params: { date },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const answer = record(body);
  const raw = Array.isArray(answer?.['schedule']) ? answer['schedule'] : [];

  const schedule: ScheduleHour[] = raw
    .map((entry): ScheduleHour | null => {
      const hour = record(entry);
      const label = text(hour?.['hour']);
      if (label === null) return null;
      return { hour: label, departures: toDepartures(hour?.['departures']) };
    })
    .filter(isPresent);

  return {
    stop: requireStop(answer, 'Timetable'),
    date: text(answer?.['date']) ?? date,
    servingLines: toServingLines(answer?.['servingLines']),
    schedule,
    totalDepartures:
      typeof answer?.['totalDepartures'] === 'number'
        ? answer['totalDepartures']
        : schedule.reduce((sum, hour) => sum + hour.departures.length, 0),
    outsideTimetableRange: answer?.['outsideTimetableRange'] === true,
  };
}
