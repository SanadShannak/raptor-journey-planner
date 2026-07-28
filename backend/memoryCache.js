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

// Export the full cachedData object using a getter function
module.exports = {
  getCache: () => cachedData,
};
