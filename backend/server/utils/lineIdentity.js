/*
 * How a transit line is identified in URLs and across responses.
 *
 * A designation alone is not unique: HSL runs an "H" that is a tram and an "H"
 * that is a train, so `/routes/H` would be ambiguous. The mode qualifies it.
 *
 * The mode is written as a word rather than the raw GTFS `route_type`, so the
 * identifier reads as what it is — `bus-550` instead of `3-550`. Both are
 * equally unique (464 ids across HSL, no collisions) and equally cheap to
 * parse; only one of them is legible in a link a person might read or share.
 *
 * Splitting on the first hyphen is unambiguous: no designation in the feed
 * contains a hyphen, and none needs URL-encoding.
 *
 * This lives in one place because three separate responses build the same id —
 * journey legs, stop departure boards, and route inspection — and three copies
 * would eventually disagree.
 */

/**
 * The standard GTFS `route_type` values. The pipeline's `normalizeRouteType`
 * collapses extended (three- and four-digit) codes into this range before
 * anything reaches here, so these ten are what the compiled data holds.
 */
const MODE_SLUGS = {
  0: "tram",
  1: "metro",
  2: "train",
  3: "bus",
  4: "ferry",
  5: "cable-tram",
  6: "cable-car",
  7: "funicular",
  11: "trolleybus",
  12: "monorail",
};

/**
 * A mode's slug, falling back to the raw numeric type.
 *
 * The fallback matters for a feed carrying a type this table does not name:
 * the id stays unique and the endpoint keeps working, which is better than
 * refusing to identify a line because its mode is unfamiliar.
 */
function slugForRouteType(routeType) {
  return MODE_SLUGS[routeType] ?? `mode${routeType}`;
}

/** The stable identifier for a line, e.g. `bus-550`, `tram-1`, `train-H`. */
function lineIdFor(route) {
  if (!route) return null;
  return `${slugForRouteType(route.route_type)}-${route.short_name}`;
}

module.exports = { MODE_SLUGS, slugForRouteType, lineIdFor };
