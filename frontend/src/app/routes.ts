/**
 * Every path in the app, and the builders that produce them.
 *
 * Components never assemble a URL from a template string. Two reasons: the
 * shape of a path changes in one place rather than wherever it was written
 * out, and `encodeURIComponent` happens here instead of being remembered at
 * each call site — a line designation or stop id is data, and data in a path
 * segment has to be encoded.
 */

/** Static paths, for links and route definitions alike. */
export const paths = {
  home: '/',
  plan: '/plan',
  routes: '/routes',
  routeDetail: '/routes/:lineId',
  stops: '/stops',
  stopDetail: '/stops/:stopId',
  card: '/card',
} as const;

/** A stop page, keyed by GTFS stop id — the same id the planner accepts. */
export function stopPath(stopId: string): string {
  return `/stops/${encodeURIComponent(stopId)}`;
}

/**
 * A line page.
 *
 * `lineId` is the backend's identifier — `bus-550`, `tram-1` — mode-slugged
 * because a designation alone is ambiguous: HSL runs an "H" that is a tram and
 * an "H" that is a train.
 *
 * It is treated as **opaque**. The temptation is to split it and read the mode
 * off the front, but two slugs contain a hyphen themselves (`cable-tram`,
 * `cable-car`), so any split is wrong for them — and it would duplicate the
 * backend's slug vocabulary here, free to drift. Every response that carries a
 * `lineId` also carries `routeType`, so the mode is always available without
 * inferring it from a string.
 */
export function linePath(lineId: string): string {
  return `/routes/${encodeURIComponent(lineId)}`;
}

/** One variant of a line, selected through a search param so it is linkable. */
export function lineVariantPath(lineId: string, patternId: number): string {
  return `${linePath(lineId)}?variant=${patternId}`;
}

/**
 * One *run* of a variant — a single vehicle's journey down the line.
 *
 * The variant says which way round and which stops; the trip says which of the
 * day's departures. Both are needed, and so is the date: a trip id belongs to a
 * service day, and the same run on another day is a different trip.
 *
 * A search param rather than a path segment, for the same reason `variant` is:
 * the whole line is the ordinary view and a trip is a lens over it, so a stale
 * or unknown trip should fall back to showing the line rather than 404.
 */
export function tripPath(
  lineId: string,
  patternId: number,
  tripId: string,
  date: string,
): string {
  const params = new URLSearchParams({
    variant: String(patternId),
    trip: tripId,
    date,
  });
  return `${linePath(lineId)}?${params.toString()}`;
}
