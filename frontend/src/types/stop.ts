import type { ClockTime, GtfsRouteType, IsoDate } from './journey';

/**
 * A stop as the network publishes it, rather than as a journey passes through
 * one.
 *
 * Deliberately not the `Stop` on a leg. That one is a place a particular
 * journey calls at, and carries what that journey needs. This is the stop
 * itself: where it is, what is printed on it, and what the agency published
 * about it.
 */
export interface StopIdentity {
  /** The GTFS id, which is what a timetable is asked for. */
  id: string;
  name: string;
  code: string | null;
  /**
   * The designation printed on the stop — GTFS's optional `platform_code`.
   *
   * GTFS supplies a number and never says what it names, so the noun is the
   * client's decision. Taken from the mode: a train says "Track", everything
   * else says "Platform".
   */
  platform: string | null;
  lat: number;
  lon: number;
  /** The cross street or landmark, when the feed carries one. */
  description: string | null;
  fareZone: string | null;
  /**
   * Tri-state on purpose: `null` means nobody published it, which is not the
   * same as "not accessible" and must not be shown as though it were.
   */
  wheelchairAccessible: boolean | null;
}

/**
 * A stop with the modes calling at it, which is the shape the bounding-box
 * endpoint returns and the map draws.
 *
 * `modes` comes from that endpoint alone — `GET /api/stop/:id` does not carry
 * it, and a stop page reads the modes off `servingLines` instead.
 */
export interface NetworkStop extends StopIdentity {
  /**
   * Which vehicles call here, as standard GTFS route types.
   *
   * Empty is a real answer — a stop can outlive the routes that used it — and
   * is why the map falls back to a plain marker rather than guessing a mode.
   * Guessing would put a bus icon on a tram stop, which sends someone to the
   * wrong side of the street.
   */
  modes: GtfsRouteType[];
}

/**
 * A line calling at a stop, and where it goes from there.
 *
 * One entry per `lineId`, which encodes mode and designation but **not**
 * direction — so both directions of a line collapse into this single entry.
 * That is why `directionId` here is not "this line's direction": it is
 * whichever pattern the backend happened to see first, and presenting it as a
 * direction would be a guess. `/api/routes/:lineId` is the place to ask.
 */
export interface ServingLine {
  /** The key `/api/routes/:lineId` takes. Opaque — never split it. */
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  routeLongName: string | null;
  /** See the note above: not a direction anyone should be shown. */
  directionId: 0 | 1 | null;
  /** De-duplicated. Empty when every pattern of this line terminates here. */
  destinations: string[];
}

/**
 * One vehicle calling at the stop.
 *
 * The date is carried beside every time because GTFS counts past midnight: a
 * trip leaving at 25:10 is the 01:10 service of the following day, and a time
 * on its own sorts that to the top of a board reading as this morning.
 */
export interface StopDeparture {
  date: IsoDate;
  time: ClockTime;
  /** When it *arrives* here, which differs from `time` where it waits. */
  arrivalDate: IsoDate;
  arrivalTime: ClockTime;
  lineId: string;
  routeShortName: string;
  routeType: GtfsRouteType;
  /**
   * The operator's own destination sign, verbatim, or null when the feed
   * carries none for this trip. Non-null licenses printing it as-is, because
   * it is what a rider will read on the front of the vehicle.
   */
  headsign: string | null;
  /**
   * Where it is heading: the headsign when there is one, the pattern's last
   * stop otherwise. **Null exactly when `terminatesHere`.**
   *
   * When `headsign` is null this value is an inference rather than a sign, so
   * it should read "towards X" rather than be presented as the sign itself.
   */
  destination: string | null;
  /** The trip ends here, so there is no onward destination to name. */
  terminatesHere: boolean;
  tripId: string | null;
  directionId: 0 | 1 | null;
  routeLongName: string | null;
}

/** `GET /api/stop/:id` — what leaves next, from the network's own clock. */
export interface StopBoard {
  stop: StopIdentity;
  /** When the board was resolved, so a tab left open is detectable as stale. */
  asOf: { date: IsoDate; time: ClockTime };
  servingLines: ServingLine[];
  /** Ascending. Empty is a real answer at the end of service, not a failure. */
  departures: StopDeparture[];
}

/** One hour of a day's board. Ordered, and kept as a list for that reason. */
export interface ScheduleHour {
  /** Zero-padded, `"00"` to `"23"`. */
  hour: string;
  departures: StopDeparture[];
}

/** `GET /api/stop/:id/timetable?date=` — a whole service day. */
export interface StopTimetable {
  stop: StopIdentity;
  date: IsoDate;
  servingLines: ServingLine[];
  /**
   * An array rather than an object keyed by hour, and it matters: integer-like
   * object keys are hoisted, so `"10"`–`"23"` would sort ahead of `"07"` and
   * silently scramble the board.
   */
  schedule: ScheduleHour[];
  totalDepartures: number;
  /**
   * The date falls outside the feed's calendar altogether — a different empty
   * state from "nothing runs here that day", and worth different wording.
   */
  outsideTimetableRange: boolean;
}
