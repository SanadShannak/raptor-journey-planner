const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// Custom dynamic configuration
const config = require("../pipelineConfig");
const calculateTimeOfDayInSeconds = require("../utils/calculateTimeOfDayInSeconds");
const normalizeRouteType = require("../utils/normalizeRouteType");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

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
const routesOutputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/routes.processed.json`,
);
const tripMappingOutputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/trip-mapping.json`,
);
const serviceMapping = require(
  `../../processed-data/${activeNetwork}-processed-data/service-mapping.processed.json`,
);
const stopMap = require(
  `../../processed-data/${activeNetwork}-processed-data/stop-mapping.json`,
);

console.log(
  `Initializing Route Builder for network [${activeNetwork.toUpperCase()}]...`,
);

const routeNamesMap = {};
const routeTypesMap = {};
const tripToSequenceMap = {};

function loadRouteDetails() {
  return new Promise((resolve, reject) => {
    console.log("Extracting raw data into human-readable format");

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
        if (!row.route_id || !row.route_short_name || !row.route_type) {
          return reject(
            new Error(
              "Data Ingestion Error: GTFS routes.txt is missing a required base property",
            ),
          );
        }
        // Extracting specific information from raw data
        routeNamesMap[row.route_id] = row.route_short_name;
        routeTypesMap[row.route_id] = normalizeRouteType(row.route_type);
      })

      // Data read from original file is finished
      .on("end", () => {
        console.log(
          `Successfully loaded ${Object.keys(routeNamesMap).length} route details.`,
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
          if (!row.trip_id || !row.route_id || !row.service_id) {
            return reject(
              new Error(
                `Data Ingestion Error: GTFS ${path.basename(fullTripPath)} is missing a required base property`,
              ),
            );
          }

          // Retrieve the flat integer token mapped to this specific GTFS service_id
          const serviceFlatId = serviceMapping[row.service_id];

          // Make a new entry in the tripToSequenceMap with the trip's route_id, service_id, and empty arrays to catch sequential stops and departure times
          tripToSequenceMap[row.trip_id] = {
            agency_route_id: row.route_id,
            service_id: serviceFlatId,
            stops: [],
            stop_departure_times: [],
          };
        })

        // If all trip files have been read, resolve
        .on("end", () => {
          completedFiles++;
          console.log(`Processed ${path.basename(fullTripPath)} file.`);
          if (completedFiles === tripFiles.length) {
            console.log(
              `Trip mapping initialized with ${Object.keys(tripToSequenceMap).length} total trips.`,
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
    console.log(
      "Streaming stop_times.txt to compile journey sequences and temporal departures",
    );

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
        const rawStopDeptTime = row.departure_time;

        // Pipeline rule validation: Ensure required properties exits in raw data
        if (!tripId || !rawStopId || !rawStopDeptTime) {
          return reject(
            new Error(
              "Data Ingestion Error: stop_times.txt missing required header",
            ),
          );
        }

        // Convert GTFS string format ("HH:MM:SS") into flat integer seconds since midnight
        const stopDeptTimeSecs = calculateTimeOfDayInSeconds(rawStopDeptTime);

        // If the trip exists in our sequence map, push the internal stop token and parallel departure time
        if (tripToSequenceMap[tripId]) {
          const internalStopId = stopMap[rawStopId];
          tripToSequenceMap[tripId].stops.push(internalStopId);
          tripToSequenceMap[tripId].stop_departure_times.push(stopDeptTimeSecs);
        }
        totalRowsParsed++;
      })
      .on("end", () => {
        console.log(
          `Successfully appended sequential stops and temporal data across ${totalRowsParsed} stop_times rows.`,
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
    console.log(
      "Compiling stop sequences into routes and organizing chronological service buckets...",
    );
    const routeGroups = {};
    // String-to-Integer Trip Map
    const tripMapping = {};
    let uniqueRouteCounter = 0;
    let uniqueTripCounter = 0;

    // Phase 1: Grouping - Loop through every parsed trip to establish unique routes and assign trips to service buckets
    for (const stringTripId in tripToSequenceMap) {
      const tripData = tripToSequenceMap[stringTripId];
      const stopSequence = tripData.stops;
      const serviceId = tripData.service_id;

      // Create a unique text signature for each route based on its stop sequence
      const routeSignature = stopSequence.join("-");

      // Enforce early trip mapping token generation
      if (tripMapping[stringTripId] === undefined) {
        tripMapping[stringTripId] = uniqueTripCounter++;
      }
      const tokenizedTripIntId = tripMapping[stringTripId];

      if (!routeGroups[routeSignature]) {
        // A new route has been found, initialize its structural properties
        const agencyRouteId = tripData.agency_route_id;
        const agencyRouteType = routeTypesMap[agencyRouteId];
        const routeShortName = routeNamesMap[agencyRouteId];
        const stopOrderMap = {};

        stopSequence.forEach((stopId, stopOrder) => {
          stopOrderMap[stopId] = stopOrder;
        });

        routeGroups[routeSignature] = {
          route_id: uniqueRouteCounter,
          agency_route_id: agencyRouteId,
          short_name: routeShortName,
          route_type: agencyRouteType,
          stop_ids: stopSequence,
          stop_order_map: stopOrderMap,
          service_buckets: {},
        };
        uniqueRouteCounter++;
      }

      // If the service has not yet been added to the service bucket of this route, add an object with a temporary unsorted trips array
      if (!routeGroups[routeSignature].service_buckets[serviceId]) {
        routeGroups[routeSignature].service_buckets[serviceId] = {
          unsorted_trips: [],
        };
      }

      // Push this trip's nested data into its designated service bucket for later chronological sorting
      routeGroups[routeSignature].service_buckets[
        serviceId
      ].unsorted_trips.push({
        tokenized_trip_id: tokenizedTripIntId,
        trip_stop_times: tripData.stop_departure_times,
      });
    }

    // Phase 2: Sorting & Slicing - Convert nested objects into V8-optimized parallel flat arrays
    for (const signature in routeGroups) {
      const routeData = routeGroups[signature];

      // Iterate through every active calendar service bucket designated to this specific route
      for (const serviceId in routeData.service_buckets) {
        const tripBucket = routeData.service_buckets[serviceId];

        // Sort the trips chronologically strictly based on the departure time of their origin stop (index 0)
        tripBucket.unsorted_trips.sort(
          (a, b) => a.trip_stop_times[0] - b.trip_stop_times[0],
        );

        // Initialize the new cache-friendly parallel bucket architecture
        const newBucket = { trip_ids: [] };

        // Dynamically instantiate an empty array for every valid stop index along the route
        routeData.stop_ids.forEach((_, stopIndex) => {
          newBucket[stopIndex] = [];
        });

        // Slice the sorted trip objects horizontally into their respective parallel index arrays
        for (const trip of tripBucket.unsorted_trips) {
          // Distribute each stop's specific departure time into the matching stop_index array
          newBucket.trip_ids.push(trip.tokenized_trip_id);

          routeData.stop_ids.forEach((_, stopIndex) => {
            newBucket[stopIndex].push(trip.trip_stop_times[stopIndex]);
          });
        }

        // Replace the temporary object-heavy bucket with the flattened parallel array bucket
        routeGroups[signature].service_buckets[serviceId] = newBucket;
      }
    }

    // Convert the routes map into a clean flat array
    const finalRoutesArray = Object.values(routeGroups);

    console.log(
      `Saving ${finalRoutesArray.length} compiled RAPTOR routes to disk...`,
    );
    // Create routes output file (if non existing), stringify the 'finalRoutesArray' & write to its output file (using arg '2' for indentation)
    fs.writeFileSync(
      routesOutputPath,
      JSON.stringify(finalRoutesArray, null, 2),
    );
    console.log(`Saving Trip token mapping configuration dictionary...`);
    // Create trip mapping output file (if non existing), stringify the 'tripMapping' & write to its output file (using arg '2' for indentation)

    fs.writeFileSync(
      tripMappingOutputPath,
      JSON.stringify(tripMapping, null, 2),
    );
    console.log(
      `Successfully compiled and formatted ${finalRoutesArray.length} routes.`,
    );
    resolve();
  });
}

async function runRouteParsingPipeline() {
  try {
    console.log("\x1b[34m%s\x1b[0m", "\nRoute Parsing Started.\n");

    await loadRouteDetails();
    await parseTripsAndStopTimes();
    await loadStopTime();
    await compileAndWriteRoutes();

    console.log("\x1b[34m%s\x1b[0m", "\nRoute Parsing Finished.\n");
  } catch (e) {
    console.error("Route Parsing Pipeline failed: ", e);
  }
}

runRouteParsingPipeline();
