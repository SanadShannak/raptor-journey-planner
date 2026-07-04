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
console.log(
  `Successfully loaded ${stops.length} stops. Generating footpath matrix...`,
);

// Constants for Transfer Logic
const MAX_WALKING_DISTANCE_METERS = 1000;
const DETOUR_FACTOR = 1.3; // Simulates real sidewalk routing instead of straight line walking
const WALKING_SPEED_MPS = 1.4; // Average human walking pace (meters/sec)

const footpathMatrix = {};

// Generate footpaths for all stations
for (let i = 0; i < stops.length; i++) {
  const stopA = stops[i];
  footpathMatrix[i] = [];
  // Every stop must have a self-transfer entry to itself costing 0 seconds
  footpathMatrix[i].push({ to_stop_id: i, duration: 0 });

  // Check walking distance to every other station
  for (let j = 0; j < stops.length; j++) {
    if (j == i) continue; // Same station (handled previously), skip
    const stopB = stops[j];
    // Calculate Haversine distance between the 2 stations
    const distanceMeters = haversine(
      stopA.lat,
      stopA.lon,
      stopB.lat,
      stopB.lon,
    );
    // Apply spatial radius filter
    if (distanceMeters <= MAX_WALKING_DISTANCE_METERS) {
      const estimatedRealDistance = distanceMeters * DETOUR_FACTOR;
      const walkingSeconds = Math.round(
        estimatedRealDistance / WALKING_SPEED_MPS,
      );
      footpathMatrix[i].push({
        to_stop_id: j,
        duration: walkingSeconds,
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
