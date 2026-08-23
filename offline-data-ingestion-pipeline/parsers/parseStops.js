const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
// Custom dynamic configuration
const config = require("../pipelineConfig");
const { optionalValue, optionalInteger } = require("../utils/optionalValue");

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

/*
 * Optional GTFS columns. Every one of these is optional in the spec, so a feed
 * that omits them must still compile — the field is simply left off the record
 * and the capability flag in network-meta tells the consumer not to expect it.
 * Counted rather than merely detected, because a column can be present and
 * blank in every row, which is the same thing as absent.
 */
const optionalFieldCounts = {
  stop_code: 0,
  desc: 0,
  zone: 0,
  wheelchair: 0,
  platform: 0,
};

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
    const stopCode = optionalValue(row.stop_code);
    const stopName = row.stop_name;
    const stopLat = parseFloat(row.stop_lat);
    const stopLon = parseFloat(row.stop_lon);

    const stopRecord = {
      id: internalStopIdCounter,
      gtfs_id: gtfsStopId,
      stop_code: stopCode,
      name: stopName,
      lat: stopLat,
      lon: stopLon,
    };
    if (stopCode !== null) optionalFieldCounts.stop_code++;

    /*
     * The cross street or landmark. With many stops sharing a name — HSL has
     * 4,092 distinct names across 8,367 stops — this is the most useful thing
     * for telling two search results apart.
     */
    const stopDesc = optionalValue(row.stop_desc);
    if (stopDesc !== null && stopDesc !== stopName) {
      stopRecord.desc = stopDesc;
      optionalFieldCounts.desc++;
    }

    // Fare zone, for journey pricing and card products later.
    const zoneId = optionalValue(row.zone_id);
    if (zoneId !== null) {
      stopRecord.zone = zoneId;
      optionalFieldCounts.zone++;
    }

    /*
     * The designation on the stop itself — a platform, track, or stand number.
     * In GTFS each of these is its own stop with its own `platform_code`, so
     * this belongs to the record rather than to any trip calling at it.
     *
     * The column is optional in the spec and plenty of feeds omit it, which is
     * why nothing downstream may assume it: absent means the field is simply
     * left off the record, exactly as `stop_desc` and `zone_id` are.
     *
     * The *word* for it is not in the data. GTFS says only what the
     * designation is, never whether it is a platform or a track, so choosing
     * between those is the presenter's job and is done from the mode.
     */
    const platformCode = optionalValue(row.platform_code);
    if (platformCode !== null) {
      stopRecord.platform = platformCode;
      optionalFieldCounts.platform++;
    }

    /*
     * GTFS wheelchair_boarding: 1 accessible, 2 not accessible, 0 or blank
     * meaning no information. Zero is dropped because "no information" and
     * "field absent" are the same thing to a consumer, and keeping it would
     * put a meaningless value on 4,831 of HSL's stops.
     */
    const wheelchair = optionalInteger(row.wheelchair_boarding);
    if (wheelchair === 1 || wheelchair === 2) {
      stopRecord.wheelchair = wheelchair;
      optionalFieldCounts.wheelchair++;
    }

    // Adding new stop and its details onto the stops array
    stopsArray.push(stopRecord);

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
    fs.writeFileSync(outputPath, JSON.stringify(stopsArray));
    //Create mapping output file (if non existing), stringify the 'stringToIntegerMap' & write to its output file (using arg '2' for indentation)

    fs.writeFileSync(mappingPath, JSON.stringify(stringToIntegerMap));

    console.log(
      `Successfully compiled ${internalStopIdCounter} stops into optimized indexes.`,
    );
    for (const [field, count] of Object.entries(optionalFieldCounts)) {
      console.log(
        count > 0
          ? `  Optional field '${field}': present on ${count} stops.`
          : `  Optional field '${field}': absent from this feed.`,
      );
    }
    console.log("\x1b[34m%s\x1b[0m", "\nStop Parsing Finished.\n");
  })

  // Catch any error while extracting data
  .on("error", (err) => {
    console.error("Parsing Stops Failed: ", err);
  });
