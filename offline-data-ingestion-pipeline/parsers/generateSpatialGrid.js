const fs = require("fs");
const path = require("path");
// Custom dynamic configuration
const config = require("../pipelineConfig");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

// Define the dimensions of each spatial grid box (~500 meters)
const GRID_SIZE_DEGREES = 0.005;

// Define the read path for the pre-processed flat stops array
const inputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stops.processed.json`,
);

// Define the write path for the generated spatial grid map
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/spatial-grid.processed.json`,
);

console.log("\x1b[34m%s\x1b[0m", "\nSpatial grid Generation Started.\n");

// Safety check to ensure the required dependency file exists before proceeding
if (!fs.existsSync(inputPath)) {
  console.error("stops.processed.json not found. Run parseStops.js first.");
}

// Load the parsed flat stops array into memory
const stops = JSON.parse(fs.readFileSync(inputPath));

// Initialize the empty hash map that will map coordinate keys to arrays of nearby stops
const spatialGrid = {};

// Iterate through every parsed stop to mathematically place it inside its corresponding spatial box
stops.forEach((stop) => {
  // Extract the necessary coordinates and metadata for the current stop
  const stopId = stop.id;
  const stopLat = stop.lat;
  const stopLon = stop.lon;
  const stopCode = stop.stop_code;

  // Calculate the zero-indexed grid cell integers for the latitude and longitude
  const latGridIndex = Math.floor(stopLat / GRID_SIZE_DEGREES);
  const lonGridIndex = Math.floor(stopLon / GRID_SIZE_DEGREES);

  // Generate the unique string key representing this specific geographic square
  const gridBoxKey = `${latGridIndex}_${lonGridIndex}`;

  // If this is the first stop mapped to this square, initialize an empty array for it
  if (!spatialGrid[gridBoxKey]) {
    spatialGrid[gridBoxKey] = [];
  }

  // Append the stop's location and identifier data into its designated geographic square array
  spatialGrid[gridBoxKey].push({
    id: stopId,
    lat: stopLat,
    lon: stopLon,
    stop_code: stopCode,
  });
});

// Serialize and write the fully populated spatial grid hash map to disk
fs.writeFileSync(outputPath, JSON.stringify(spatialGrid, null, 2));

console.log(
  `Spatial Grid generated successfully! Created ${Object.keys(spatialGrid).length} populated grid squares.`,
);

console.log("\x1b[34m%s\x1b[0m", "\nSpatial grid Generation Finished.\n");
