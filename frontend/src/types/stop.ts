import type { GtfsRouteType } from './journey';

/**
 * A stop as the network publishes it, rather than as a journey passes through
 * one.
 *
 * Deliberately not the `Stop` on a leg. That one is a place a particular
 * journey calls at, and carries what that journey needs — the platform you
 * stand on, the code printed on the pole. This is the stop itself, and carries
 * what identifies it on a map: where it is, and what calls there.
 */
export interface NetworkStop {
  /** The GTFS id, which is what a timetable is asked for. */
  id: string;
  name: string;
  code: string | null;
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
