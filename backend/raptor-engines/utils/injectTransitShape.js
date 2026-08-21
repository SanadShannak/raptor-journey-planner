const memoryCache = require("../../memoryCache");

const cachedData = memoryCache.getCache();
const tripToShapeIdMap = cachedData.tripToShapeIdMap;
const shapes = cachedData.shapes;

function injectTransitShape(tripId, startStop, endStop, stops) {
  /*
   * Safety Check: does this network have shape data at all? shapes.txt is
   * optional in GTFS, so both of these are null for a feed without it and
   * every leg takes the straight-line fallback below.
   */
  const tripShapeData = tripToShapeIdMap?.[tripId];

  if (tripShapeData && tripShapeData.shape_id && shapes) {
    const shapeId = tripShapeData.shape_id;
    const stopIndexMap = tripShapeData.stop_index_in_shape_map;
    const startStopIndexInShape = stopIndexMap[startStop];
    const endStopIndexInShape = stopIndexMap[endStop];

    // Safety Check: Are the indices valid and does the master shape array exist?
    if (
      startStopIndexInShape !== undefined &&
      endStopIndexInShape !== undefined &&
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
