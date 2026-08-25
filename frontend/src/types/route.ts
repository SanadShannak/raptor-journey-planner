import type { Coordinates, GtfsRouteType, IsoDate, ClockTime } from './journey';
import type { StopIdentity } from './stop';

/**
 * A line, a variant, and the times along one.
 *
 * The compiled data holds stop-sequence **patterns**, not lines: a RAPTOR route
 * is one exact sequence, so every direction and every short working is its own
 * record — 1,179 of them for HSL's 464 lines. Riders think in lines, so a line
 * is what the index lists and the patterns behind it are its *variants*.
 *
 * `lineId` is the backend's key and is treated as **opaque** everywhere. It
 * reads `bus-550` or `tram-1`, and the temptation is to split it and take the
 * mode off the front — but `cable-tram` and `cable-car` contain a hyphen
 * themselves, so any split is wrong for them. Every response carrying a
 * `lineId` also carries `routeType`, so there is never a need to.
 */

/** One line in the index. */
export interface LineSummary {
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  /** Null when the feed omits `route_long_name`. */
  routeLongName: string | null;
  variantCount: number;
  /**
   * Which directions this line has patterns for.
   *
   * `[0, 1]` where the feed carries `direction_id`, and that pair is precisely
   * what licenses a direction flip. **Empty is a real answer** for a feed
   * without the column — a client should then tell variants apart by their end
   * points rather than inventing a direction it cannot prove.
   */
  directions: (0 | 1)[];
}

/**
 * One variant of a line: a stop sequence somebody's trips actually follow.
 *
 * `patternId` indexes the compiled patterns. Stable for the life of a dataset
 * but **not across a pipeline re-run**, so a client holding one across a data
 * refresh falls back to the line's first variant rather than erroring.
 */
export interface LineVariant {
  patternId: number;
  directionId: 0 | 1 | null;
  /** The operator's own sign for this pattern, verbatim. Null when unstated. */
  headsign: string | null;
  originStopName: string | null;
  terminusStopName: string | null;
  stopCount: number;
  /** Ranks the everyday service above short workings and depot runs. */
  tripCount: number | null;
  /**
   * The pattern's **lifetime** span across every service it runs on, not the
   * span of any one day. It answers "how early does this line start" rather
   * than "what runs on Thursday".
   */
  firstDeparture: ClockTime | null;
  lastDeparture: ClockTime | null;
  /**
   * Exactly the days this variant runs, ascending.
   *
   * Narrower than `/api/valid-dates` on purpose: that is every day the *feed*
   * covers, this is every day the *variant* moves. HSL's tram 1 runs on 31 of
   * the 60, and the feed carries at least one covered day with no service at
   * all. **Empty is a real answer** for a variant whose services have expired.
   *
   * Carried on the summary, not only on the variant in full, because choosing
   * between variants needs it — a line's short workings are often seasonal.
   *
   * **Not necessarily contiguous.** The first and last entries are a range, not
   * a promise about every day between them; ask `includes()` about a day.
   */
  serviceDates: IsoDate[];
}

/** A line with the variants behind it, ordered busiest first. */
export interface Line {
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  routeLongName: string | null;
  directions: (0 | 1)[];
  variants: LineVariant[];
}

/**
 * A stop along a pattern.
 *
 * The same identity a stop endpoint returns, plus where it falls on this line.
 */
export interface PatternStop extends StopIdentity {
  /**
   * The stop's position in the pattern — **not** its position in the array.
   *
   * A stop whose internal record is missing is dropped from the list, so the
   * list can have holes. This is the number to join on: a timetable trip's
   * `calls` is indexed by it.
   */
  sequence: number;
  /** Null for a feed without `shape_dist_traveled`. */
  distanceFromOriginMeters: number | null;
}

/** One variant in full: where it goes, what it looks like, and when it runs. */
export interface LineVariantDetail extends LineVariant {
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  routeLongName: string | null;
  stops: PatternStop[];
  /** The pattern's own length, holes included. `stops.length` may be smaller. */
  stopCount: number;
  /**
   * The pattern's *representative* geometry — trips on one pattern can use
   * different shapes, so the most-used is stored. Null for a feed without
   * `shapes.txt`, where a client draws stop to stop instead.
   */
  shape: Coordinates[] | null;
}

/** One vehicle at one stop: when it pulls in, and when it leaves again. */
export interface TripCall {
  date: IsoDate;
  time: ClockTime;
  /** Differs from {@link time} only where the vehicle waits. */
  arrivalDate: IsoDate;
  arrivalTime: ClockTime;
}

/** One run of the variant, from end to end. */
export interface VariantTrip {
  /** The GTFS trip id. Null when the feed's mapping has no entry for it. */
  tripId: string | null;
  /**
   * This trip's own sign, falling back to the pattern's. A pattern's trips do
   * not always share one — HSL's rail H runs a single Helsinki–Siuntio pattern
   * whose trips are signed both "Siuntio-Hanko" and "Siuntio".
   */
  headsign: string | null;
  /**
   * A call per stop of the pattern, indexed by {@link PatternStop.sequence}.
   *
   * Always `stopCount` long. **An entry may be `null`** — a trip short a stop
   * time leaves a hole, because dropping it would shift every stop after it.
   */
  calls: (TripCall | null)[];
}

/** `GET /api/routes/:lineId/:patternId/timetable?date=` — one service day. */
export interface VariantTimetable {
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  routeLongName: string | null;
  patternId: number;
  directionId: 0 | 1 | null;
  headsign: string | null;
  date: IsoDate;
  stops: PatternStop[];
  stopCount: number;
  /** Ascending by first departure, merged across every service that day. */
  trips: VariantTrip[];
  totalTrips: number;
  /**
   * The date falls outside the feed's calendar altogether — a limit of the
   * data rather than a fact about this line, and worth different wording from
   * "nothing runs that day".
   */
  outsideTimetableRange: boolean;
}
