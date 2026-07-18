const fs = require("fs");
const path = require("path");

// Custom dynamic configuration
const config = require("../pipelineConfig");
// Haversine distance calculator
const haversine = require("../utils/calculateHaversine");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;
const inputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stops.processed.json`,
);
const stopToRoutesPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stop-to-routes.json`,
);
const routesPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/routes.processed.json`,
);

const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/footpaths.processed.json`,
);

console.log("\x1b[34m%s\x1b[0m", "\nFootpath Generation Started.\n");

// Read and parse the file directly into memory
if (!fs.existsSync(inputPath)) {
  console.error(
    `Error: Could not find processed stops at ${path.basename(inputPath)}. Make sure to run previous parsing steps first!`,
  );
  process.exit(1);
}
console.log(`Loading processed stops from ${path.basename(inputPath)}`);
// Read and parse stops into an array
const stops = JSON.parse(fs.readFileSync(inputPath));
const stopToRoutesProcessed = JSON.parse(fs.readFileSync(stopToRoutesPath));
const routesProcessed = JSON.parse(fs.readFileSync(routesPath));

console.log(
  `Successfully loaded ${stops.length} stops. Generating footpath matrix...`,
);

// Constants for Transfer Logic
const MAX_WALKING_DISTANCE_METERS = 1000;
const DETOUR_FACTOR = 1.2; // Simulates real sidewalk routing instead of straight line walking

const footpathMatrix = {};

// Generate footpaths for all stops
for (let i = 0; i < stops.length; i++) {
  const stopA = stops[i];
  let exitStopTimePenalty = 0;

  let routesToCheckRouteType = stopToRoutesProcessed[i] || [];
  // Loop through ALL routes serving this stop
  for (let r = 0; r < routesToCheckRouteType.length; r++) {
    let routeIndex = routesToCheckRouteType[r];
    let routeType = routesProcessed[routeIndex]["route_type"];

    if (routeType == 1 || routeType == 2 || routeType == 4) {
      exitStopTimePenalty = 120;
      break; // Found a heavy transit mode! Stop checking.
    }
  }
  footpathMatrix[i] = [];
  // Every stop must have a self-transfer entry to itself costing 0 seconds
  footpathMatrix[i].push({ to_stop_id: i, distance: 0 });

  // Check walking distance to every other stop
  for (let j = 0; j < stops.length; j++) {
    if (j == i) continue; // Same stop (handled previously), skip
    const stopB = stops[j];
    let enterStopTimePenalty = 0;
    routesToCheckRouteType = stopToRoutesProcessed[j] || [];
    // Loop through ALL routes serving this stop
    for (let r = 0; r < routesToCheckRouteType.length; r++) {
      let routeIndex = routesToCheckRouteType[r];
      let routeType = routesProcessed[routeIndex]["route_type"];

      if (routeType == 1 || routeType == 2 || routeType == 4) {
        enterStopTimePenalty = 120;
        break; // Found a heavy transit mode! Stop checking.
      }
    }
    // Calculate Haversine distance between the 2 stops
    const distanceMeters = haversine(
      stopA.lat,
      stopA.lon,
      stopB.lat,
      stopB.lon,
    );
    // Apply spatial radius filter
    if (distanceMeters <= MAX_WALKING_DISTANCE_METERS) {
      const estimatedRealDistance =
        Math.round((distanceMeters * DETOUR_FACTOR) / 10) * 10;

      footpathMatrix[i].push({
        to_stop_id: j,
        distance: estimatedRealDistance,
        stop_access_penalty: exitStopTimePenalty + enterStopTimePenalty,
      });
    }
  }
}

console.log(
  `Calculated all footpaths. Writing Footpath Matrix to ${path.basename(outputPath)}...`,
);
// Create footpaths output file (if non existing), stringify the 'footpathMatrix' & write to its output file (using arg '2' for indentation)

fs.writeFileSync(outputPath, JSON.stringify(footpathMatrix, null, 2));

console.log("\x1b[34m%s\x1b[0m", "\nFootpath Generation Finished.\n");
