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
const spatialGridPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/spatial-grid.processed.json`,
);

const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/footpaths.processed.json`,
);

console.log("\x1b[34m%s\x1b[0m", "\nFootpath Generation Started.\n");

// Read and parse the required files directly into memory
if (!fs.existsSync(inputPath)) {
  console.error(
    `Error: Could not find processed stops at ${path.basename(inputPath)}. Make sure to run previous parsing steps first!`,
  );
  process.exit(1);
}

if (!fs.existsSync(spatialGridPath)) {
  console.error(
    `Error: Could not find spatial grid at ${path.basename(spatialGridPath)}. Make sure to run generateSpatialGrid.js first!`,
  );
  process.exit(1);
}

console.log(`Loading processed stops from ${path.basename(inputPath)}`);

// Read and parse stops into an array
const stops = JSON.parse(fs.readFileSync(inputPath));

console.log(`Loading spatial grid from ${path.basename(spatialGridPath)}`);

// Read and parse spatial grid into memory
const spatialGrid = JSON.parse(fs.readFileSync(spatialGridPath));

const stopToRoutesProcessed = JSON.parse(fs.readFileSync(stopToRoutesPath));
const routesProcessed = JSON.parse(fs.readFileSync(routesPath));

console.log(
  `Successfully loaded ${stops.length} stops. Generating footpath matrix...`,
);

// Constants for Transfer Logic
const MAX_WALKING_DISTANCE_METERS = 1000;
const DETOUR_FACTOR = 1.2; // Simulates real sidewalk routing instead of straight line walking

// Spatial grid dimensions must match the dimensions used when generating the grid
const GRID_SIZE_DEGREES = 0.005;

// Pre-calculate the stop access penalty for every stop
// This prevents repeatedly checking all routes for the same stop
const stopAccessPenalties = new Array(stops.length);

for (let i = 0; i < stops.length; i++) {
  const routesToCheckRouteType = stopToRoutesProcessed[i] || [];

  let stopAccessPenalty = 0;

  // Loop through ALL routes serving this stop
  for (let r = 0; r < routesToCheckRouteType.length; r++) {
    const routeIndex = routesToCheckRouteType[r];
    const routeType = routesProcessed[routeIndex]["route_type"];

    if (routeType == 1 || routeType == 2 || routeType == 4) {
      stopAccessPenalty = 120;
      break; // Found a heavy transit mode! Stop checking.
    }
  }

  stopAccessPenalties[i] = stopAccessPenalty;
}

console.log(
  `Calculated stop access penalties. Starting footpath generation...`,
);

// Create footpaths output file using a writable stream
// This prevents the entire footpath matrix from being converted into one massive string
const outputStream = fs.createWriteStream(outputPath);

// Start the JSON object
outputStream.write("{");

// Track whether this is the first stop being written
let isFirstStop = true;

// Generate footpaths for all stops
for (let i = 0; i < stops.length; i++) {
  const stopA = stops[i];

  const exitStopTimePenalty = stopAccessPenalties[i];

  // Calculate the spatial grid coordinates for the current stop
  const latGridIndex = Math.floor(stopA.lat / GRID_SIZE_DEGREES);
  const lonGridIndex = Math.floor(stopA.lon / GRID_SIZE_DEGREES);

  // Store only the current stop's footpaths in memory
  const currentFootpaths = [];

  // Every stop must have a self-transfer entry to itself costing 0 seconds
  currentFootpaths.push({
    to_stop_id: i,
    distance: 0,
    stop_access_penalty: 0,
  });

  // Check the surrounding spatial grid boxes instead of every stop in the network
  // Two boxes in each direction provide enough coverage for the 1000m walking radius
  for (let latOffset = -2; latOffset <= 2; latOffset++) {
    for (let lonOffset = -2; lonOffset <= 2; lonOffset++) {
      const nearbyGridBoxKey = `${latGridIndex + latOffset}_${lonGridIndex + lonOffset}`;

      const nearbyStops = spatialGrid[nearbyGridBoxKey];

      // No stops exist inside this grid box
      if (!nearbyStops) continue;

      // Check only stops located inside this nearby grid box
      for (let s = 0; s < nearbyStops.length; s++) {
        const stopB = nearbyStops[s];

        const j = stopB.id;

        // Same stop (handled previously), skip
        if (j == i) continue;

        // Calculate Haversine distance between the 2 stops
        const distanceMeters = haversine(
          stopA.lat,
          stopA.lon,
          stopB.lat,
          stopB.lon,
        );

        // Apply spatial radius filter
        const estimatedRealDistance =
          Math.round((distanceMeters * DETOUR_FACTOR) / 10) * 10;

        if (estimatedRealDistance <= MAX_WALKING_DISTANCE_METERS) {
          const enterStopTimePenalty = stopAccessPenalties[j];

          currentFootpaths.push({
            to_stop_id: j,
            distance: estimatedRealDistance,
            stop_access_penalty: exitStopTimePenalty + enterStopTimePenalty,
          });
        }
      }
    }
  }

  // Convert only this stop's footpaths into JSON
  const stopKey = JSON.stringify(String(i));
  const stopValue = JSON.stringify(currentFootpaths);

  // JSON object requires commas between properties
  if (!isFirstStop) {
    outputStream.write(",");
  }

  // Write the current stop's property to disk
  outputStream.write(`${stopKey}:${stopValue}`);

  isFirstStop = false;
}

// Close the JSON object
outputStream.write("}");
outputStream.end();

outputStream.on("finish", () => {
  console.log(
    `Calculated all footpaths. Footpath Matrix written to ${path.basename(outputPath)}.`,
  );

  console.log("\x1b[34m%s\x1b[0m", "\nFootpath Generation Finished.\n");
});

outputStream.on("error", (err) => {
  console.error("Failed writing footpath matrix:", err);
});
