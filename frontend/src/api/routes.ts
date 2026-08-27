/**
 * Route endpoints — the line index, one line's variants, one variant in full,
 * and one variant's timetable for a day.
 *
 * UI code calls these functions; it never sees URLs, query-string assembly, or
 * response parsing. Every field is read defensively rather than cast: the
 * backend's own fallback branches omit keys rather than sending nulls, so an
 * optional field is checked before it is trusted.
 */

import { getJson } from './client';
import { ApiError } from './errors';
import type { Coordinates, GtfsRouteType, IsoDate } from '../types/journey';
import type {
  Line,
  LineSummary,
  LineVariant,
  LineVariantDetail,
  PatternStop,
  TripCall,
  VariantTimetable,
  VariantTrip,
} from '../types/route';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toDirection = (raw: unknown): 0 | 1 | null =>
  raw === 0 || raw === 1 ? raw : null;

const isPresent = <T,>(value: T | null): value is T => value !== null;

/** Standard GTFS route types only; anything else is dropped rather than kept. */
const toDirections = (raw: unknown): (0 | 1)[] =>
  Array.isArray(raw) ? raw.filter((value): value is 0 | 1 => value === 0 || value === 1) : [];

const toIsoDates = (raw: unknown): IsoDate[] =>
  Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];

/**
 * The fields every line-shaped response carries.
 *
 * Null when there is no `lineId`, which is the one thing nothing downstream can
 * recover from — a line with no identity cannot be headed, linked, or asked
 * about again.
 */
function toLineIdentity(raw: Record<string, unknown> | null): {
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  routeLongName: string | null;
} | null {
  if (raw === null) return null;

  const lineId = text(raw['lineId']);
  const routeType = number(raw['routeType']);
  if (lineId === null || routeType === null) return null;

  return {
    lineId,
    // A line with no designation is still a line; its id is the honest label.
    routeShortName: text(raw['routeShortName']) ?? lineId,
    routeType: routeType as GtfsRouteType,
    routeLongName: text(raw['routeLongName']),
  };
}

function toLineSummary(raw: unknown): LineSummary | null {
  const line = record(raw);
  const identity = toLineIdentity(line);
  if (line === null || identity === null) return null;

  return {
    ...identity,
    variantCount: number(line['variantCount']) ?? 0,
    directions: toDirections(line['directions']),
    activeToday: line['activeToday'] === true,
  };
}

/**
 * One variant's summary.
 *
 * `patternId` is the only field that cannot be defaulted — it is how the
 * variant is asked for again — so a variant without one is dropped.
 */
function toVariant(raw: unknown): LineVariant | null {
  const variant = record(raw);
  if (variant === null) return null;

  const patternId = number(variant['patternId']);
  if (patternId === null) return null;

  return {
    patternId,
    directionId: toDirection(variant['directionId']),
    headsign: text(variant['headsign']),
    originStopName: text(variant['originStopName']),
    terminusStopName: text(variant['terminusStopName']),
    stopCount: number(variant['stopCount']) ?? 0,
    tripCount: number(variant['tripCount']),
    firstDeparture: text(variant['firstDeparture']),
    lastDeparture: text(variant['lastDeparture']),
    serviceDates: toIsoDates(variant['serviceDates']),
  };
}

/**
 * A stop along the pattern.
 *
 * Dropped when it has no id or no position: one cannot be linked to and the
 * other cannot be drawn. `sequence` falls back to the array index, which is
 * correct for every list that has no holes and is the only guess available for
 * one that does.
 */
function toPatternStop(raw: unknown, index: number): PatternStop | null {
  const stop = record(raw);
  if (stop === null) return null;

  const id = text(stop['id']);
  const lat = number(stop['lat']);
  const lon = number(stop['lon']);
  if (id === null || lat === null || lon === null) return null;

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
    sequence: number(stop['sequence']) ?? index,
    distanceFromOriginMeters: number(stop['distanceFromOriginMeters']),
  };
}

const toPatternStops = (raw: unknown): PatternStop[] =>
  Array.isArray(raw) ? raw.map(toPatternStop).filter(isPresent) : [];

/** `[lat, lon]` pairs, in the API's order and Leaflet's. */
function toShape(raw: unknown): Coordinates[] | null {
  if (!Array.isArray(raw)) return null;

  const points = raw.filter(
    (point): point is Coordinates =>
      Array.isArray(point) &&
      point.length >= 2 &&
      typeof point[0] === 'number' &&
      typeof point[1] === 'number' &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );

  // A single point is not a line. Null says "draw stop to stop instead",
  // which is the same thing a feed without shapes.txt says.
  return points.length >= 2 ? points : null;
}

/**
 * One call, or the hole where a trip has no stop time.
 *
 * The hole is preserved as `null` rather than dropped: `calls` is indexed by a
 * stop's position in the pattern, so removing an entry would shift every stop
 * after it onto the wrong row.
 */
function toCall(raw: unknown): TripCall | null {
  const call = record(raw);
  if (call === null) return null;

  const date = text(call['date']);
  const time = text(call['time']);
  if (date === null || time === null) return null;

  return {
    date,
    time,
    arrivalDate: text(call['arrivalDate']) ?? date,
    arrivalTime: text(call['arrivalTime']) ?? time,
  };
}

/**
 * One trip.
 *
 * A trip with no readable call at all is dropped — there is no row to draw and
 * nothing to sort it by. One with some holes is kept, holes and all.
 */
function toTrip(raw: unknown, stopCount: number, fallbackDate: IsoDate): VariantTrip | null {
  const trip = record(raw);
  if (trip === null) return null;

  const raws = Array.isArray(trip['calls']) ? trip['calls'] : [];
  const calls: (TripCall | null)[] = [];
  // Padded to the pattern's length so every row is the same width as the stop
  // list beside it, whatever the response happened to send.
  for (let index = 0; index < Math.max(stopCount, raws.length); index += 1) {
    calls.push(toCall(raws[index]));
  }
  if (!calls.some(isPresent)) return null;

  return {
    tripId: text(trip['tripId']),
    // A backend that predates the field answers for the date asked about,
    // which is what it always meant before there was anything else to mean.
    serviceDate: text(trip['serviceDate']) ?? fallbackDate,
    headsign: text(trip['headsign']),
    calls,
  };
}

/** The identity every route response is built around, and cannot be without. */
function requireLine(
  body: Record<string, unknown> | null,
  what: string,
): NonNullable<ReturnType<typeof toLineIdentity>> {
  const identity = toLineIdentity(body);
  if (identity === null) {
    throw new ApiError('malformed', `${what} response did not describe a line.`);
  }
  return identity;
}

/**
 * `GET /api/routes?q=&mode=` — the line index.
 *
 * `q` matches designation or long name, folded so "hameentie" finds
 * "Hämeentie"; `mode` is a single GTFS route type. Both are the backend's job
 * rather than the client's, because the index is the one route response big
 * enough to be worth not shipping whole.
 */
export async function getLines(
  options: CallOptions & { q?: string | undefined; mode?: GtfsRouteType | undefined } = {},
): Promise<{ lines: LineSummary[]; totalLines: number }> {
  const body = await getJson('/api/routes', {
    params: {
      ...(options.q === undefined || options.q === '' ? {} : { q: options.q }),
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const answer = record(body) ?? {};
  const raw = Array.isArray(answer['lines']) ? answer['lines'] : [];
  const lines = raw.map(toLineSummary).filter(isPresent);

  return {
    lines,
    totalLines: number(answer['totalLines']) ?? lines.length,
  };
}

/** `GET /api/routes/:lineId` — one line and its variants, busiest first. */
export async function getLine(lineId: string, options: CallOptions = {}): Promise<Line> {
  const body = await getJson(`/api/routes/${encodeURIComponent(lineId)}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const answer = record(body);
  const raw = Array.isArray(answer?.['variants']) ? answer['variants'] : [];

  return {
    ...requireLine(answer, 'Line'),
    directions: toDirections(answer?.['directions']),
    variants: raw.map(toVariant).filter(isPresent),
  };
}

/**
 * `GET /api/routes/:lineId/:patternId` — one variant's stops, shape and days.
 *
 * `serviceDates` — carried on the variant summary, so it arrives here too — is
 * what a date control on this page offers. Deliberately not `/api/valid-dates`:
 * that is every day the feed covers, including days this line does not run.
 */
export async function getLineVariant(
  lineId: string,
  patternId: number,
  options: CallOptions = {},
): Promise<LineVariantDetail> {
  const body = await getJson(
    `/api/routes/${encodeURIComponent(lineId)}/${encodeURIComponent(patternId)}`,
    { ...(options.signal ? { signal: options.signal } : {}) },
  );

  const answer = record(body);
  const variant = toVariant(answer);
  if (variant === null) {
    throw new ApiError('malformed', 'Variant response did not identify a pattern.');
  }
  const stops = toPatternStops(answer?.['stops']);

  return {
    ...requireLine(answer, 'Variant'),
    ...variant,
    stops,
    // The pattern's own length, which can exceed the list when a stop record
    // is missing. Falling back to the list is the only honest guess.
    stopCount: number(answer?.['stopCount']) ?? stops.length,
    shape: toShape(answer?.['shape']),
  };
}

/**
 * `GET /api/routes/:lineId/:patternId/timetable?date=` — one service day.
 *
 * A trip per row and a time per stop, `calls` indexed by each stop's
 * `sequence`. `date` is required by the backend, and a well-formed impossible
 * one comes back as an ordinary empty board with `outsideTimetableRange` set
 * rather than as an error.
 */
export async function getVariantTimetable(
  lineId: string,
  patternId: number,
  date: IsoDate,
  options: CallOptions = {},
): Promise<VariantTimetable> {
  const body = await getJson(
    `/api/routes/${encodeURIComponent(lineId)}/${encodeURIComponent(patternId)}/timetable`,
    {
      params: { date },
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );

  const answer = record(body);
  const stops = toPatternStops(answer?.['stops']);
  const stopCount = number(answer?.['stopCount']) ?? stops.length;
  const raw = Array.isArray(answer?.['trips']) ? answer['trips'] : [];
  const day = text(answer?.['date']) ?? date;
  const trips = raw.map((trip) => toTrip(trip, stopCount, day)).filter(isPresent);

  return {
    ...requireLine(answer, 'Timetable'),
    patternId: number(answer?.['patternId']) ?? patternId,
    directionId: toDirection(answer?.['directionId']),
    headsign: text(answer?.['headsign']),
    date: day,
    stops,
    stopCount,
    trips,
    totalTrips: number(answer?.['totalTrips']) ?? trips.length,
    outsideTimetableRange: answer?.['outsideTimetableRange'] === true,
  };
}
