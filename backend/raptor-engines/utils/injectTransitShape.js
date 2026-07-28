const memoryCache = require("../../memoryCache");

const cachedData = memoryCache.getCache();
const tripToShapeIdMap = cachedData.tripToShapeIdMap;
const shapes = cachedData.shapes;

function injectTransitShape(tripId, startStop, endStop, stops) {
  // Safety Check: Does this trip have mapped shape data?
  const tripShapeData = tripToShapeIdMap[tripId];

  if (tripShapeData && tripShapeData.shape_id) {
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
