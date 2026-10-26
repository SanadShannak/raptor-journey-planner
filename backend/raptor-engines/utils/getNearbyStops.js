const calculateHaversine = require("./calculateHaversine");
const memoryCache = require("../../memoryCache");
const { isInServiceArea } = require("../../src/utils/serviceArea");

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
// Inside the service area but beyond walking reach: how many of the nearest
// stops to offer the engine, and how much further than the nearest one a stop
// may be and still be offered
const FALLBACK_STOP_COUNT = 5;
const FALLBACK_SLACK_METERS = 500;
// How far the fallback looks before giving up, in grid squares (~55 km)
const FALLBACK_MAX_RINGS = 100;

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

  /*
   * Nothing within walking reach. Outside the service area that is the
   * answer, and the engine reports the point as out of bounds exactly as
   * before. Inside it — a hole or a bay the area fills, in the middle of a
   * town — the point is planned from its nearest few stops instead, however
   * far the walk. The check is one lookup, and this only runs where the
   * function used to return nothing, so no other request pays for it.
   */
  if (nearbyStops.length === 0 && isInServiceArea(lat, lon)) {
    return getNearestStops(lat, lon, centerLatIndex, centerLonIndex);
  }
  return nearbyStops;
}

/**
 * The nearest few stops to a point, searched in widening rings of grid
 * squares from the point's own square. From the centre rather than from where
 * the walking-reach search stopped: its squares can hold a stop just beyond
 * reach, which is the nearest one there is. Once a stop is found,
 * one more ring is searched — a square further out can hold a nearer stop
 * than the ring it was found in — and the nearest FALLBACK_STOP_COUNT within
 * FALLBACK_SLACK_METERS of the nearest are returned, in the same shape and
 * with the same detour and access penalty as the walking-reach search.
 */
function getNearestStops(lat, lon, centerLatIndex, centerLonIndex) {
  const candidates = [];
  let lastRing = FALLBACK_MAX_RINGS;

  for (let ring = 0; ring <= lastRing; ring++) {
    for (let dLat = -ring; dLat <= ring; dLat++) {
      for (let dLon = -ring; dLon <= ring; dLon++) {
        // Only the ring's own squares: those inside it were searched already
        if (Math.abs(dLat) !== ring && Math.abs(dLon) !== ring) continue;
        const gridKey = `${centerLatIndex + dLat}_${centerLonIndex + dLon}`;
        const stopsInSquare = spatialGrid[gridKey];
        if (!stopsInSquare) continue;
        for (const stop of stopsInSquare) {
          // A stop nothing calls at is no way into the network from this far
          if ((stopToRoutes[stop.id] || []).length === 0) continue;
          candidates.push({
            stop,
            distanceMeters: calculateHaversine(lat, lon, stop.lat, stop.lon),
          });
        }
      }
    }
    if (candidates.length > 0 && lastRing === FALLBACK_MAX_RINGS) {
      lastRing = ring + 1;
    }
  }

  if (candidates.length === 0) return [];
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const limit = candidates[0].distanceMeters + FALLBACK_SLACK_METERS;

  return candidates
    .filter(({ distanceMeters }) => distanceMeters <= limit)
    .slice(0, FALLBACK_STOP_COUNT)
    .map(({ stop, distanceMeters }) => {
      let accessStopTimePenalty = 0;
      for (const routeIndex of stopToRoutes[stop.id] || []) {
        const routeType = routes[routeIndex]["route_type"];
        if (routeType == 1 || routeType == 2 || routeType == 4) {
          accessStopTimePenalty = 120;
          break;
        }
      }
      return {
        stop: stop.id,
        walkDistanceMeters:
          Math.round((distanceMeters * DETOUR_FACTOR) / 10) * 10,
        stopAccessPenalty: accessStopTimePenalty,
      };
    });
}

module.exports = getNearbyStops;
