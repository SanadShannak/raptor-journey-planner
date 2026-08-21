const fs = require("fs");
const path = require("path");
// Custom dynamic configuration
const config = require("../offline-data-ingestion-pipeline/pipelineConfig");
// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;
// Dynamic path to directory of all processed data
const allProcessedDataFolderPath = path.join(
  __dirname,
  `../processed-data/${activeNetwork}-processed-data`,
);
// Name and file path of each processed data file
const processedDataFiles = [
  {
    name: "footpaths",
    filePath: path.join(allProcessedDataFolderPath, "footpaths.processed.json"),
  },
  {
    name: "routes",
    filePath: path.join(allProcessedDataFolderPath, "routes.processed.json"),
  },
  {
    name: "stopMapping",
    filePath: path.join(allProcessedDataFolderPath, "stop-mapping.json"),
  },
  {
    name: "stops",
    filePath: path.join(allProcessedDataFolderPath, "stops.processed.json"),
  },
  {
    name: "timetables",
    filePath: path.join(
      allProcessedDataFolderPath,
      "timetables.processed.json",
    ),
  },
  {
    name: "stopToRoutes",
    filePath: path.join(allProcessedDataFolderPath, "stop-to-routes.json"),
  },
  {
    name: "activeServices",
    filePath: path.join(
      allProcessedDataFolderPath,
      "active-services.processed.json",
    ),
  },
  {
    name: "spatialGrid",
    filePath: path.join(
      allProcessedDataFolderPath,
      "spatial-grid.processed.json",
    ),
  },
];

/*
 * Files the pipeline only produces when the source feed supplied the optional
 * columns behind them. A network without them is not a broken build, so a
 * missing file leaves the cache entry null and callers degrade — the same way
 * a null `transitDistanceMeters` is handled rather than treated as a fault.
 *
 * `networkMeta.available` says which of these to expect, so consumers can
 * decide once at startup instead of null-checking everywhere.
 */
const optionalProcessedDataFiles = [
  /*
   * shapes.txt is optional in GTFS and pipelineConfig lists it as such, so a
   * feed without it must still serve. Journey legs then fall back to a
   * straight line between stops, which is what injectTransitShape already
   * does for any trip it cannot resolve.
   */
  {
    name: "tripToShapeIdMap",
    filePath: path.join(
      allProcessedDataFolderPath,
      "trip-to-shape-mapping.json",
    ),
  },
  {
    name: "shapes",
    filePath: path.join(allProcessedDataFolderPath, "shapes.processed.json"),
  },
  {
    name: "networkMeta",
    filePath: path.join(
      allProcessedDataFolderPath,
      "network-meta.processed.json",
    ),
  },
  {
    name: "tripHeadsigns",
    filePath: path.join(
      allProcessedDataFolderPath,
      "trip-headsigns.processed.json",
    ),
  },
];

// Trip Mapping file path - separately to implement reverse mapping
const tripMappingFilePath = path.join(
  allProcessedDataFolderPath,
  "trip-mapping.json",
);

// Object containing final cached data to be exported
const cachedData = {
  footpaths: null,
  routes: null,
  stopMapping: null,
  stops: null,
  timetables: null,
  stopToRoutes: null,
  activeServices: null,
  reverseTripMapping: null,
  spatialGrid: null,
  tripToShapeIdMap: null,
  shapes: null,
  networkMeta: null,
  tripHeadsigns: null,
};

console.log("Reading file contents into local RAM cache...");

processedDataFiles.forEach((fileDetails) => {
  // File check to make sure each expected processed data file exists
  if (!fs.existsSync(fileDetails.filePath)) {
    console.error(`File ${path.basename(fileDetails.filePath)} does not exist`);
    process.exit(1);
  } else {
    // Read the file's contents, and parse it straight into the cachedData object
    const parsedContent = JSON.parse(fs.readFileSync(fileDetails.filePath));
    cachedData[fileDetails.name] = parsedContent;
    // Count the number of entries parsed based on the type of data
    const count = Array.isArray(parsedContent)
      ? parsedContent.length
      : Object.keys(parsedContent).length;
    console.log(`${fileDetails.name}: Read ${count} entries`);
  }
});

// Optional files: absent is a valid state, not a failure.
optionalProcessedDataFiles.forEach((fileDetails) => {
  const fileName = path.basename(fileDetails.filePath);
  if (!fs.existsSync(fileDetails.filePath)) {
    console.log(`${fileDetails.name}: ${fileName} not present for this network`);
    return;
  }
  try {
    cachedData[fileDetails.name] = JSON.parse(
      fs.readFileSync(fileDetails.filePath),
    );
    console.log(`${fileDetails.name}: Read ${fileName}`);
  } catch (error) {
    // Unreadable is treated as absent: an optional extra must never be able to
    // stop the server from serving the data that does load.
    console.warn(`${fileDetails.name}: ${fileName} unreadable — ${error.message}`);
  }
});

// Reverse trip mapping
if (!fs.existsSync(tripMappingFilePath)) {
  console.error(`File trip-mapping.json does not exist`);
  process.exit(1);
}
const tripMapping = JSON.parse(fs.readFileSync(tripMappingFilePath));
const reverseTripMapping = [];
for (const [realId, flatId] of Object.entries(tripMapping)) {
  reverseTripMapping[flatId] = realId;
}
cachedData["reverseTripMapping"] = reverseTripMapping;

console.log(`trip-mapping: Read ${reverseTripMapping.length} entries`);
console.log("Successfully read processed data into proper data structures.");

/*
 * What this network's compiled data actually supports. Everything here is
 * false rather than undefined when network-meta is missing, so a caller can
 * ask the question without first checking whether it can be asked.
 */
const capabilities = {
  stopCode: false,
  stopDescription: false,
  fareZones: false,
  wheelchairAccessibility: false,
  routeLongName: false,
  routeDirection: false,
  routeHeadsign: false,
  tripHeadsign: false,
  routeShape: false,
  transitDistance: false,
  ...(cachedData.networkMeta?.available ?? {}),
};

/**
 * The destination sign for a trip, or null when this feed has no headsigns.
 * Reads the per-trip index rather than the pattern's own headsign, because a
 * pattern's trips do not always share one.
 */
function getTripHeadsign(flatTripId) {
  const index = cachedData.tripHeadsigns;
  if (!index) return null;
  const valueIndex = index.by_trip?.[flatTripId];
  if (valueIndex === undefined || valueIndex === null) return null;
  return index.values?.[valueIndex] ?? null;
}

// Export the full cachedData object using a getter function
module.exports = {
  getCache: () => cachedData,
  getCapabilities: () => capabilities,
  getNetworkMeta: () => cachedData.networkMeta,
  getTripHeadsign,
};
