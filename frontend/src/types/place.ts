import type { GtfsRouteType } from './journey';

/**
 * A place someone can travel from or to.
 *
 * Always carries coordinates, because that is what the routing API is given —
 * every journey is planned coordinate to coordinate. The engine resolves stops
 * to coordinates internally anyway, and a coordinate origin sidesteps the
 * documented stop-to-stop limitation where a query can fail when the exact
 * origin stop has no direct connection.
 *
 * `kind` exists only so the interface can *say* what was chosen. A result the
 * geocoder identified as a transit stop is drawn as a station rather than a
 * dropped pin, and can link onward to its timetable — but it still travels to
 * the API as a latitude and a longitude like everything else.
 */
export interface Place {
  /** Stable within one set of suggestions; used as a list key, not an id. */
  key: string;
  lat: number;
  lon: number;
  /** What the person picked, as they saw it written. */
  label: string;
  /**
   * Where it is — a street, district, or city. Null when the geocoder gives
   * nothing more than the name, which is common for a bare address.
   */
  context: string | null;
  kind: PlaceKind;
  /**
   * The network's own stop id, when the geocoder knew this place is a stop in
   * the loaded feed. Null for an ordinary address, and null for a transit stop
   * the geocoder knows about but our feed does not.
   */
  stopId: string | null;
  /**
   * The stop's public code — the one printed on the pole, `"H0101"` on HSL.
   * It is what distinguishes the six separate "Pasila" stops from each other,
   * so it is shown rather than kept for lookups. Null unless the geocoder
   * knows the transit network.
   */
  stopCode: string | null;
  /**
   * Platform or stand designation within a station, `"5"` or `"24"`. Distinct
   * from {@link stopCode}: a code identifies the stop in the feed, a platform
   * tells a traveller where to stand.
   */
  platform: string | null;
  /**
   * Which modes call here, as standard GTFS `route_type` values.
   *
   * Empty rather than null when the geocoder knows this is a stop but not what
   * serves it, so a caller can tell "no modes reported" from "not a stop".
   * Null on anything that is not a stop.
   *
   * Drives the icon: a rail platform gets the train silhouette rather than the
   * bus one every stop used to default to.
   */
  modes: GtfsRouteType[] | null;
}

/**
 * `stop` is claimed only when the geocoder identifies a public-transport stop.
 * Everything else is a `place`: an address, a park, a shop, a district.
 */
export type PlaceKind = 'place' | 'stop';

/** What a geocoder needs in order to answer a query well. */
export interface PlaceSearchOptions {
  /** Aborts an in-flight lookup when the query moves on. */
  signal?: AbortSignal | undefined;
  /**
   * Preferred language for the results. Passed through so an Arabic-speaking
   * visitor sees "الصويفية" rather than a transliteration.
   */
  language?: string | undefined;
  /** How many suggestions to ask for. */
  limit?: number | undefined;
  /**
   * Restricts results to the network's area.
   *
   * Not a nicety: unbounded, a search for a district name can return a café on
   * the other side of the country, and the planner will dutifully route to it.
   */
  bounds?:
    | { minLat: number; minLon: number; maxLat: number; maxLon: number }
    | undefined;
}

/**
 * A source of place suggestions.
 *
 * Kept behind an interface because the right geocoder depends on the network:
 * Helsinki has one that knows its own stops, and another city will not. Adding
 * a network means adding an adapter, not changing the form.
 */
export interface Geocoder {
  /** Identifies the adapter in configuration and error messages. */
  readonly id: string;
  /** Attribution the adapter's terms require to be displayed. */
  readonly attribution: string;
  search(query: string, options?: PlaceSearchOptions): Promise<Place[]>;
}
