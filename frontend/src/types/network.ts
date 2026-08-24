import type { GtfsRouteType } from './journey';

/**
 * What the loaded network is, and what its compiled data supports.
 *
 * Fetched once at startup. The capability flags exist so the interface can
 * decide what to render *before* it sees a record — which keeps "this network
 * publishes no accessibility data" distinct from "this particular stop is
 * missing it". They are not the same thing to a traveller.
 */
export interface NetworkInfo {
  network: string;
  /**
   * IANA zone every date and time in this API is expressed in. The only thing
   * it is used for is working out what "now" is on the network; values coming
   * back from the API are already resolved and must not be converted again.
   */
  timezone: string;
  /** The language stop and route names are written in. Null when unstated. */
  language: string | null;
  agencyName: string | null;
  publisherName: string | null;
  feedStartDate: string | null;
  feedEndDate: string | null;
  capabilities: NetworkCapabilities;
  /**
   * The standard GTFS route types this network actually runs, ascending.
   *
   * Distinct from {@link NetworkCapabilities}, and the difference is the whole
   * point: those say which optional columns the feed supplied, this says what
   * moves. A mode filter needs the second, and offering a fixed list instead
   * would put a ferry on a network that has none.
   *
   * **Empty is a real answer** for a feed with no routes. Offer no filter
   * rather than falling back to a default set.
   */
  modes: GtfsRouteType[];
}

export interface NetworkCapabilities {
  stopCode: boolean;
  stopDescription: boolean;
  fareZones: boolean;
  wheelchairAccessibility: boolean;
  routeLongName: boolean;
  routeDirection: boolean;
  routeHeadsign: boolean;
  tripHeadsign: boolean;
  routeShape: boolean;
  transitDistance: boolean;
}
