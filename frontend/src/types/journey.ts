/**
 * Domain types for the journey-planning API.
 *
 * These mirror the responses of `GET /api/planner` and `GET /api/valid-dates`
 * exactly as the backend returns them. No field is invented here: every
 * property below was observed on a live response and confirmed against
 * `backend/utils/formatItinerary.js`.
 */

/** Calendar date in `YYYY-MM-DD` form, e.g. `"2026-09-13"`. */
export type IsoDate = string;

/** Wall-clock time of day as returned by the API: `HH:mm`, e.g. `"18:03"`. */
export type ClockTime = string;

/**
 * Wall-clock time of day as accepted by the API in query parameters: `HH:mm:ss`.
 * The API returns `HH:mm` but expects `HH:mm:ss` on the way in.
 */
export type ClockTimeWithSeconds = string;

/** A single point of a leg's drawn geometry, ordered `[latitude, longitude]`. */
export type Coordinates = [latitude: number, longitude: number];

/**
 * GTFS `route_type`. The backend passes the feed's value through unchanged and
 * uses only the standard set — no extended (three-digit) codes.
 *
 * 0 tram · 1 metro · 2 rail · 3 bus · 4 ferry · 5 cable tram
 * 6 aerial lift · 7 funicular · 11 trolleybus · 12 monorail
 */
export type GtfsRouteType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 11 | 12;

/**
 * A boarding/alighting point of a leg.
 *
 * The first and last legs of a journey use synthetic stops representing the
 * user's own pins rather than real transit stops: `code` is `"ORIGIN_PIN"` or
 * `"TARGET_PIN"` and `name` is `"ORIGIN"` or `"TARGET"`.
 */
export interface Stop {
  /**
   * GTFS stop id — the same value `/api/planner` accepts as `originStopId`,
   * so a leg's stop can be linked to or planned onward from. Null on the
   * synthetic origin/target pins, which are not real stops.
   */
  id: string | null;
  name: string;
  code: string | null;
  lat: number;
  lon: number;
}

/**
 * A stop a transit leg passes through without the traveller changing vehicle.
 *
 * Note the `stop`-prefixed property names — this is a different shape from
 * {@link Stop}, not the same type reused.
 */
export interface IntermediateStop {
  /** GTFS stop id, for linking through to the stop. */
  stopId: string;
  stopName: string;
  stopCode: string | null;
  stopLat: number;
  stopLon: number;
  stopArrivalTime: ClockTime;
}

/** Discriminator for the leg union. */
export type LegMode = 'WALK' | 'TRANSIT';

/** Fields present on every leg regardless of mode. */
interface LegBase {
  mode: LegMode;
  /**
   * Minutes spent waiting at `fromStop` *before* this leg departs at
   * `startTime`. It sits between the previous leg's `endTime` and this leg's
   * `startTime`, and is excluded from this leg's own walk/transit durations.
   * Because `totalDurationMinutes` is measured start-to-end in wall-clock
   * time, waiting is still counted there.
   */
  waitDurationMinutes: number;
  /** Departure, i.e. after any `waitDurationMinutes` has elapsed. */
  startDate: IsoDate;
  startTime: ClockTime;
  endDate: IsoDate;
  endTime: ClockTime;
  fromStop: Stop;
  toStop: Stop;
  /** Polyline for the leg, from `fromStop` to `toStop`. */
  shape: Coordinates[];
}

/** A leg travelled on foot. */
export interface WalkLeg extends LegBase {
  mode: 'WALK';
  /** Rounded to whole minutes, with a floor of 1 for any non-zero duration. */
  walkDurationMinutes: number;
  /** Rounded to the nearest 50 m, with a floor of 50 for any non-zero distance. */
  walkDistanceMeters: number;

  /* Always null on a walking leg — kept so the union stays exhaustive. */
  routeShortName: null;
  routeType: null;
  lineId: null;
  routeLongName: null;
  directionId: null;
  destination: null;
  intermediateStops: null;
  tripId: null;
  transitDurationMinutes: null;
  transitDistanceMeters: null;
}

/** A leg travelled aboard a public transport vehicle. */
export interface TransitLeg extends LegBase {
  mode: 'TRANSIT';
  /** Public-facing line designation, e.g. `"6"`, `"M2"`, `"K"`. */
  routeShortName: string;
  routeType: GtfsRouteType;
  /**
   * Identifier for the line, `${modeSlug}-${routeShortName}` — `"bus-550"`,
   * `"tram-1"`. The designation alone is not unique: HSL runs an `"H"` that is
   * a tram and an `"H"` that is a train. This is the key `/api/routes/:lineId`
   * takes.
   */
  lineId: string;
  /**
   * Descriptive name, e.g. `"Eira - Lasipalatsi - Ooppera - Käpylä"`.
   * Null when the feed omits the optional `route_long_name` column.
   */
  routeLongName: string | null;
  /**
   * Which way along the line this leg travels. Null when the feed omits the
   * optional `direction_id` column — check `capabilities.routeDirection` from
   * `/api/network` before building UI that depends on it.
   */
  directionId: 0 | 1 | null;
  /**
   * Where the vehicle is heading: the trip's own destination sign when the
   * feed carries one, otherwise the pattern's last stop name. Deliberately not
   * called `headsign` — on a feed without headsigns it is derived, and naming
   * it after the GTFS field would invite treating a derivation as the
   * operator's own sign text.
   */
  destination: string | null;
  /** Stops passed through between `fromStop` and `toStop`; may be empty. */
  intermediateStops: IntermediateStop[];
  tripId: string;
  transitDurationMinutes: number;
  /**
   * Null when the source GTFS feed omits the optional `shape_dist_traveled`
   * column, in which case the pipeline disables distance tracking entirely.
   * The HSL feed provides it; other networks may not.
   */
  transitDistanceMeters: number | null;

  /* Always null on a transit leg. */
  walkDurationMinutes: null;
  walkDistanceMeters: null;
}

/**
 * One stage of a journey. Narrow on `mode` to get the mode-specific fields:
 *
 * ```ts
 * if (leg.mode === 'TRANSIT') {
 *   leg.routeShortName; // string
 * }
 * ```
 */
export type JourneyLeg = WalkLeg | TransitLeg;

/** A complete door-to-door itinerary returned by `GET /api/planner`. */
export interface Journey {
  startDate: IsoDate;
  startTime: ClockTime;
  endDate: IsoDate;
  endTime: ClockTime;
  /**
   * Wall-clock minutes from `startTime` to `endTime`. May span midnight, in
   * which case `endDate` is later than `startDate`.
   */
  totalDurationMinutes: number;
  legs: JourneyLeg[];
}

/**
 * Either end of a journey. The backend accepts a dropped map pin or a known
 * stop; the `type` names mirror the backend's own internal vocabulary.
 */
export type JourneyEndpoint =
  | { type: 'coordinate'; lat: number; lon: number }
  | { type: 'stop'; stopId: string };

/** Parameters accepted by `GET /api/planner`. */
export interface JourneyQuery {
  origin: JourneyEndpoint;
  destination: JourneyEndpoint;
  date: IsoDate;
  time: ClockTimeWithSeconds;
  /**
   * Walking pace in metres per second. Omit to let the engine apply its own
   * default; see `DEFAULT_WALKING_SPEED_MPS` for the value to show in the UI.
   */
  walkingSpeedMps?: number | undefined;
}
