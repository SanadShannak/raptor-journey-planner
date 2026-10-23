const memoryCache = require("../../memoryCache");

const cachedData = memoryCache.getCache();
const getTripShape = memoryCache.getTripShape;
const shapes = cachedData.shapes;

/*
 * Where in the shape a stop sits, for the visit at `position` in the route.
 *
 * A stop visited once has one offset, stored as a number. A stop a pattern
 * visits twice — a loop that starts and ends at one terminal — has one per
 * visit, stored as an array in visiting order, so the visit is picked by how
 * many times the stop has already appeared before `position`.
 */
function shapeIndexAt(stopIndexMap, routeStopIds, position) {
  const stop = routeStopIds[position];
  const offsets = stopIndexMap[stop];
  if (!Array.isArray(offsets)) return offsets;

  let visit = 0;
  for (let i = 0; i < position; i++) {
    if (routeStopIds[i] === stop) visit++;
  }
  return offsets[visit];
}

function injectTransitShape(
  tripId,
  routeStopIds,
  boardPosition,
  alightPosition,
  stops,
) {
  const startStop = routeStopIds[boardPosition];
  const endStop = routeStopIds[alightPosition];

  /*
   * Safety Check: does this network have shape data at all? shapes.txt is
   * optional in GTFS, so for a feed without it getTripShape answers null and
   * `shapes` is null too, and every leg takes the straight-line fallback below.
   */
  const tripShapeData = getTripShape(tripId);

  if (tripShapeData && tripShapeData.shape_id && shapes) {
    const shapeId = tripShapeData.shape_id;
    const stopIndexMap = tripShapeData.stop_index_in_shape_map;
    const startStopIndexInShape = shapeIndexAt(
      stopIndexMap,
      routeStopIds,
      boardPosition,
    );
    const endStopIndexInShape = shapeIndexAt(
      stopIndexMap,
      routeStopIds,
      alightPosition,
    );

    // Safety Check: Are the indices valid and does the master shape array exist?
    if (
      startStopIndexInShape !== undefined &&
      endStopIndexInShape !== undefined &&
      startStopIndexInShape < endStopIndexInShape &&
      shapes[shapeId]
    ) {
      // O(1) Array Slicing!
      return shapes[shapeId].slice(
        startStopIndexInShape,
        endStopIndexInShape + 1,
      );
    }
  }

  // Fallback: Draw a straight line between the two stations
  return [
    [stops[startStop].lat, stops[startStop].lon],
    [stops[endStop].lat, stops[endStop].lon],
  ];
}

module.exports = injectTransitShape;
