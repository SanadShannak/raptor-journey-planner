const fs = require("fs");
const path = require("path");

// Custom dynamic configuration
const config = require("../pipelineConfig");
// Haversine distance calculator
const haversine = require("../utils/calculateHaversine");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;
const stopsInputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stops.processed.json`,
);
const routesInputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/routes.processed.json`,
);
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stop-to-routes.json`,
);

console.log("\x1b[34m%s\x1b[0m", "\nStop-to-Route Parsing Started.\n");

// Read and parse the file directly into memory
if (!fs.existsSync(routesInputPath) || !fs.existsSync(stopsInputPath)) {
  console.error(
    `Error: Could not find processed stops or routes. Make sure to run previous parsing steps first!`,
  );
  process.exit(1);
}

// Read and parse stops into an array
console.log(`Loading processed stops from ${path.basename(stopsInputPath)}`);
const stops = JSON.parse(fs.readFileSync(stopsInputPath));
console.log(`Successfully loaded ${stops.length} stops.`);
// Read and parse routes into an array
console.log(`Loading processed routes from ${path.basename(routesInputPath)}`);
const routes = JSON.parse(fs.readFileSync(routesInputPath));
console.log(`Successfully loaded ${routes.length} routes.`);

// Stop-to-Routes map
const stopToRoutes = {};

// Create an empty array of routes for each stop in the stopToRoutes Map
stops.forEach((_, index) => {
  stopToRoutes[index] = [];
});
// Check the stops that each route passes through and add them to the array of routes of that stop in the stopToRoutes Map
routes.forEach((route) => {
  route.stop_ids.forEach((stopIndex) => {
    if (!stopToRoutes[stopIndex].includes(route.route_id)) {
      stopToRoutes[stopIndex].push(route.route_id);
    }
  });
});

// Create Stop-To-Route output file (if non existing), stringify the 'stopToRoutes' & write to its output file (NOT using arg '2' for indentation because of memory limits)
fs.writeFileSync(outputPath, JSON.stringify(stopToRoutes));

console.log(
  `Successfully parsed all routes for ${Object.keys(stopToRoutes).length} stops.`,
);

console.log("\x1b[34m%s\x1b[0m", "\nStop-to-Route Parsing Finished.\n");
