const calculateHaversine = require("./calculateHaversine");
const memoryCache = require("../../memoryCache");

// Retrieve cached data structure
const cachedData = memoryCache.getCache();
const spatialGrid = cachedData.spatialGrid;
// Added stopMapping to translate string IDs to internal integer indices
const stopMapping = cachedData.stopMapping;
const stopToRoutes = cachedData.stopToRoutes;
const routes = cachedData.routes;

const GRID_SIZE_DEGREES = 0.005;
const MAX_WALKING_DISTANCE_METERS = 2500;
// Simulates real sidewalk routing instead of straight line walking
const DETOUR_FACTOR = 1.2;

function getNearbyStops(lat, lon) {
  const nearbyStops = [];

  // Calculate how many grid squares out we need to search (e.g., 5 squares for 2500m)
  const gridSearchRadius = Math.ceil(
    MAX_WALKING_DISTANCE_METERS / 1000 / (GRID_SIZE_DEGREES * 111),
  );

  // Find the mathematical center box where the origin coordinate resides
  const centerLatIndex = Math.floor(lat / GRID_SIZE_DEGREES);
  const centerLonIndex = Math.floor(lon / GRID_SIZE_DEGREES);

  // Loop through the surrounding squares to form a bounding box
  for (let dLat = -gridSearchRadius; dLat <= gridSearchRadius; dLat++) {
    for (let dLon = -gridSearchRadius; dLon <= gridSearchRadius; dLon++) {
      const gridKey = `${centerLatIndex + dLat}_${centerLonIndex + dLon}`;

      // O(1) Check: Only process if this grid square actually contains stops
      if (spatialGrid[gridKey]) {
        const stopsInSquare = spatialGrid[gridKey];

        stopsInSquare.forEach((stop) => {
          // Calculate straight-line distance using spherical trigonometry
          const distanceMeters = calculateHaversine(
            lat,
            lon,
            stop.lat,
            stop.lon,
          );

          // Apply the detour factor to simulate urban street grids and round to nearest 10m
          const estimatedRealDistance =
            Math.round((distanceMeters * DETOUR_FACTOR) / 10) * 10;

          // Strict cutoff using the detoured distance
          if (estimatedRealDistance <= MAX_WALKING_DISTANCE_METERS) {
            let accessStopTimePenalty = 0;

            let routesToCheckRouteType = stopToRoutes[stop.id] || [];
            // Loop through ALL routes serving this stop
            for (let r = 0; r < routesToCheckRouteType.length; r++) {
              let routeIndex = routesToCheckRouteType[r];
              let routeType = routes[routeIndex]["route_type"];

              if (routeType == 1 || routeType == 2 || routeType == 4) {
                accessStopTimePenalty = 120;
                break; // Found a heavy transit mode! Stop checking.
              }
            }

            nearbyStops.push({
              stop: stop.id,
              walkDistanceMeters: estimatedRealDistance,
              stopAccessPenalty: accessStopTimePenalty,
            });
          }
        });
      }
    }
  }
  return nearbyStops;
}

module.exports = getNearbyStops;
