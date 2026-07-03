const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
// Custom dynamic configuration
const config = require("../pipelineConfig");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;
const stopMap = require(
  `../../processed-data/${activeNetwork}-processed-data/stop-mapping.json`,
);

const routesInputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data/routes.txt`,
);

const rawDataDir = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data`,
);
// Read all files in the directory dynamically
const allFiles = fs.readdirSync(rawDataDir);
// Filter files to isolate only files matching 'trips*.txt'
const tripFiles = allFiles.filter(
  (file) => file.startsWith("trips") && file.endsWith(".txt"),
);

const stopTimesInputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data/stop_times.txt`,
);
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/routes.processed.json`,
);

console.log(
  `Initializing Route Builder for network [${activeNetwork.toUpperCase()}]...`,
);

const routeNamesMap = {};
const tripToSequenceMap = {};

function loadRouteNames() {
  return new Promise((resolve, reject) => {
    console.log("Extracting route_id to human-readable format");

    // Reading raw data from GTFS file and pipelining into csv reader
    fs.createReadStream(routesInputPath)
      .pipe(
        csv({
          // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("data", (row) => {
        // Pipeline rule validation: Ensure required properties exits in raw data
        if (!row.route_id || !row.route_short_name) {
          return reject(
            new Error(
              "Data Ingestion Error: GTFS routes.txt is missing a required base property",
            ),
          );
        }
        // Extracting specific information from raw data
        routeNamesMap[row.route_id] = row.route_short_name;
      })

      // Data read from original file is finished
      .on("end", () => {
        console.log(
          `Successfully loaded ${Object.keys(routeNamesMap).length} route names.`,
        );
        resolve();
      })

      // Catch any error while extracting data
      .on("error", (err) => {
        console.error("Parsing Routes Failed: ", err);
      });
  });
}

function parseTripsAndStopTimes() {
  return new Promise((resolve, reject) => {
    // Check that there are trip files
    if (tripFiles.length === 0) {
      return reject(
        new Error("No trip files matching pattern 'trips*.txt' found."),
      );
    }
    let completedFiles = 0;
    tripFiles.forEach((tripFilePath) => {
      // reconstruct the full path for each trip file
      const fullTripPath = path.join(rawDataDir, tripFilePath);
      // Reading raw data from GTFS file and pipelining into csv reader
      fs.createReadStream(fullTripPath)
        .pipe(
          csv({
            // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
            mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
          }),
        )
        .on("data", (row) => {
          // Pipeline rule validation: Ensure required properties exits in raw data
          if (!row.trip_id || !row.route_id) {
            return reject(
              new Error(
                `Data Ingestion Error: GTFS ${path.basename(fullTripPath)} is missing a required base property`,
              ),
            );
          }
          // Make a new entry in the tripToSequenceMap with the trip's route_id and an empty array of stops
          tripToSequenceMap[row.trip_id] = {
            agency_route_id: row.route_id,
            stops: [],
          };
        })

        // If all trip files have been read, resolve
        .on("end", () => {
          completedFiles++;
          console.log(`Processed ${path.basename(fullTripPath)} file.`);
          if (completedFiles === tripFiles.length) {
            console.log(
              `Mapping initialized with ${Object.keys(tripToSequenceMap).length} trips.`,
            );
            resolve();
          }
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  });
}

function loadStopTime() {
  return new Promise((resolve, reject) => {
    console.log("Streaming stop_times.txt to compile journey sequences");

    let totalRowsParsed = 0;

    fs.createReadStream(stopTimesInputPath)
      .pipe(
        csv({
          // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("data", (row) => {
        const tripId = row.trip_id;
        const rawStopId = row.stop_id;

        // Pipeline rule validation: Ensure required properties exits in raw data
        if (!tripId || !rawStopId) {
          return reject(
            new Error(
              "Data Ingestion Error: stop_times.txt missing trip_id or stop_id",
            ),
          );
        }

        if (tripToSequenceMap[tripId]) {
          const internalStopId = stopMap[rawStopId];
          tripToSequenceMap[tripId].stops.push(internalStopId);
        }
        totalRowsParsed++;
      })
      .on("end", () => {
        console.log(
          "Successfully appended sequential stops to their respective trips",
        );
        resolve();
      })
      .on("error", (err) => {
        console.error("Parsing Stop Times Failed: ", err);
        reject(err);
      });
  });
}

function compileAndWriteRoutes() {
  return new Promise((resolve, reject) => {
    console.log("Compiling stop sequences into routes...");
    const routeGroups = {};
    let uniqueRouteCounter = 0;

    // Loop through every parsed trip
    for (const tripId in tripToSequenceMap) {
      const tripData = tripToSequenceMap[tripId];
      const stopSequence = tripData.stops;

      // Create a unique text signature for each route
      const routeSignature = stopSequence.join("-");

      if (!routeGroups[routeSignature]) {
        // A new route has been found
        const agencyRouteId = tripData.agency_route_id;
        const routeShortName = routeNamesMap[agencyRouteId];

        routeGroups[routeSignature] = {
          route_id: uniqueRouteCounter,
          agency_route_id: agencyRouteId,
          short_name: routeShortName,
          stop_ids: stopSequence,
          trip_ids: [tripId],
        };
        uniqueRouteCounter++;
      } else {
        // Route previously found, only add tripId to list of trips
        routeGroups[routeSignature].trip_ids.push(tripId);
      }
    }
    // Convert the routes map into a clean flat array
    const finalRoutesArray = Object.values(routeGroups);

    console.log(
      `Saving ${finalRoutesArray.length} compiled RAPTOR routes to disk...`,
    );
    // Create routes output file (if non existing), stringify the 'finalRoutesArray' & write to its output file (using arg '2' for indentation)
    fs.writeFileSync(outputPath, JSON.stringify(finalRoutesArray, null, 2));
    console.log(`Successfully compiled ${finalRoutesArray.length} routes.`);
    resolve();
  });
}

async function runRouteParsingPipeline() {
  try {
    console.log("\x1b[34m%s\x1b[0m", "\nRoute Parsing Started.\n");

    await loadRouteNames();
    await parseTripsAndStopTimes();
    await loadStopTime();
    await compileAndWriteRoutes();

    console.log("\x1b[34m%s\x1b[0m", "\nRoute Parsing Finished.\n");
  } catch (e) {
    console.error("Route Parsing Pipeline failed: ", e);
  }
}

runRouteParsingPipeline();
