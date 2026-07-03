const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
// Custom dynamic configuration
const config = require("../pipelineConfig");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

const inputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data/stops.txt`,
);
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stops.processed.json`,
);
const mappingPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stop-mapping.json`,
);

const stopsArray = [];
const stringToIntegerMap = {};
let internalStopIdCounter = 0;

console.log("\x1b[34m%s\x1b[0m", "\nStop Parsing Started.\n", "\x1b[0m");

console.log(
  `Opening '${path.basename(inputPath)}' for ${activeNetwork.toUpperCase()} network and compiling memory layouts...`,
);

// Reading raw data from GTFS file and pipelining into csv reader
fs.createReadStream(inputPath)
  .pipe(
    csv({
      // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
      mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
    }),
  )
  .on("data", (row) => {
    // Pipeline rule validation: Ensure required properties exits in raw data
    if (!row.stop_id || !row.stop_name || !row.stop_lat || !row.stop_lon) {
      console.error(
        "Data Ingestion Error: GTFS stop.txt is missing a required base property",
      );
      process.exit(1);
    }
    // Extracting specific information from raw data
    const gtfsStopId = row.stop_id;
    const stopName = row.stop_name;
    const stopLat = parseFloat(row.stop_lat);
    const stopLon = parseFloat(row.stop_lon);

    // Adding new stop and its details onto the stops array
    stopsArray.push({
      id: internalStopIdCounter,
      gtfs_id: gtfsStopId,
      name: stopName,
      lat: stopLat,
      lon: stopLon,
    });

    // Mapping the original stop_id with its memory location
    stringToIntegerMap[gtfsStopId] = internalStopIdCounter;
    // Increment the internal stop id counter to prepare for the next stop
    internalStopIdCounter++;
  })
  // Data read from original file is finished
  .on("end", () => {
    // Create the the output folder (including all subfolders)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    //Create stops output file (if non existing), stringify the 'stopsArray' & write to its output file (using arg '2' for indentation)
    fs.writeFileSync(outputPath, JSON.stringify(stopsArray, null, 2));
    //Create mapping output file (if non existing), stringify the 'stringToIntegerMap' & write to its output file (using arg '2' for indentation)

    fs.writeFileSync(mappingPath, JSON.stringify(stringToIntegerMap, null, 2));

    console.log(
      `Successfully compiled ${internalStopIdCounter} stops into optimized indexes.`,
    );
    console.log("\x1b[34m%s\x1b[0m", "\nStop Parsing Finished.\n");
  })

  // Catch any error while extracting data
  .on("error", (err) => {
    console.error("Parsing Stops Failed: ", err);
  });
