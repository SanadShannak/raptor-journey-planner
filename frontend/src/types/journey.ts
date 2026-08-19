/**
 * Domain types for the journey-planning API.
 *
 * These mirror the responses of `GET /api/route` and `GET /api/valid-dates`
 * exactly as the backend returns them today. No field is invented here: every
 * property below was observed on a live response.
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
 * A boarding/alighting point of a leg.
 *
 * The first and last legs of a journey use synthetic stops representing the
 * user's own pins rather than real transit stops: `code` is `"ORIGIN_PIN"` or
 * `"TARGET_PIN"` and `name` is `"ORIGIN"` or `"TARGET"`.
 */
export interface Stop {
  name: string;
  code: string;
  lat: number;
  lon: number;
}

/**
 * A stop a transit leg passes through without the traveller changing vehicle.
 *
 * Note the different property names and the absence of coordinates compared to
 * {@link Stop} — this is the shape the API returns.
 */
export interface IntermediateStop {
  stopName: string;
  stopCode: string;
  stopArrivalTime: ClockTime;
}

/** Discriminator for the leg union. */
export type LegMode = 'WALK' | 'TRANSIT';

/**
 * Fields present on every leg regardless of mode.
 */
interface LegBase {
  mode: LegMode;
  /** Minutes spent waiting at `fromStop` before this leg departs at `startTime`. */
  waitDurationMinutes: number;
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
  walkDurationMinutes: number;
  walkDistanceMeters: number;

  /* Always null on a walking leg — kept so the union stays exhaustive. */
  routeShortName: null;
  routeType: null;
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
  /**
   * GTFS `route_type`. Observed so far: 0 (tram), 1 (metro), 2 (rail),
   * 4 (ferry). Left as `number` rather than a closed union so an unexpected
   * value from the data does not become a type error.
   */
  routeType: number;
  /** Stops passed through between `fromStop` and `toStop`; may be empty. */
  intermediateStops: IntermediateStop[];
  tripId: string;
  transitDurationMinutes: number;
  transitDistanceMeters: number;

  /* Observed as 0 and null respectively on every transit leg. */
  walkDurationMinutes: number;
  walkDistanceMeters: number | null;
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

/** A complete door-to-door itinerary returned by `GET /api/route`. */
export interface Journey {
  startDate: IsoDate;
  startTime: ClockTime;
  endDate: IsoDate;
  endTime: ClockTime;
  totalDurationMinutes: number;
  legs: JourneyLeg[];
}

/** A geographic point used as a journey endpoint. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** Parameters accepted by `GET /api/route`. */
export interface JourneyQuery {
  origin: LatLon;
  destination: LatLon;
  date: IsoDate;
  time: ClockTimeWithSeconds;
}
