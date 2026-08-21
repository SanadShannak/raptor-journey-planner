const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// Custom dynamic configuration
const config = require("../pipelineConfig");
const calculateTimeOfDayInSeconds = require("../utils/calculateTimeOfDayInSeconds");
const normalizeRouteType = require("../utils/normalizeRouteType");
const { optionalValue, optionalInteger } = require("../utils/optionalValue");

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
const tripHeadsignsOutputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/trip-headsigns.processed.json`,
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
const routeLongNamesMap = {};
const tripToSequenceMap = {};

/*
 * Which optional columns this feed actually supplies. All of these are
 * optional in GTFS, so every one is detected rather than assumed, and a feed
 * without them still compiles — the field is left off and the capability flag
 * in network-meta tells consumers not to expect it.
 */
const availability = {
  routeLongName: false,
  directionId: false,
  tripHeadsign: false,
  shapeId: false,
};

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
        if (
          !row.route_id ||
          (!row.route_short_name && !row.route_long_name) ||
          !row.route_type
        ) {
          return reject(
            new Error(
              "Data Ingestion Error: GTFS routes.txt is missing a required base property",
            ),
          );
        }
        // Extracting specific information from raw data
        routeNamesMap[row.route_id] =
          row.route_short_name || row.route_long_name;
        routeTypesMap[row.route_id] = normalizeRouteType(row.route_type);

        /*
         * The long name is kept in its own map rather than only being used as
         * a fallback for a missing short name. "Eira - Lasipalatsi - Ooppera
         * - Sörnäinen (M) - Käpylä" is what a rider reads to recognise a line;
         * the designation alone identifies it but does not describe it.
         */
        const longName = optionalValue(row.route_long_name);
        if (longName !== null && longName !== routeNamesMap[row.route_id]) {
          routeLongNamesMap[row.route_id] = longName;
          availability.routeLongName = true;
        }
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
          const tripRecord = {
            agency_route_id: row.route_id,
            service_id: serviceFlatId,
            stops: [],
            stop_departure_times: [],
          };

          /*
           * Direction, destination sign, and geometry are per trip in GTFS.
           * They are collected here and resolved onto the pattern in
           * compileAndWriteRoutes, which is where it becomes clear whether a
           * pattern's trips agree on them.
           */
          const directionId = optionalInteger(row.direction_id);
          if (directionId !== null) {
            tripRecord.direction_id = directionId;
            availability.directionId = true;
          }

          const headsign = optionalValue(row.trip_headsign);
          if (headsign !== null) {
            tripRecord.headsign = headsign;
            availability.tripHeadsign = true;
          }

          const shapeId = optionalValue(row.shape_id);
          if (shapeId !== null) {
            tripRecord.shape_id = shapeId;
            availability.shapeId = true;
          }

          tripToSequenceMap[row.trip_id] = tripRecord;
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
    let hasDistanceData = false;
    fs.createReadStream(stopTimesInputPath)
      .pipe(
        csv({
          // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("headers", (headers) => {
        if (headers.includes("shape_dist_traveled")) {
          hasDistanceData = true;
          console.log(
            "Data has shape_dist_traveled column. Distance tracking enabled.",
          );
        } else {
          console.log(
            "Data does not have shape_dist_traveled column. Distance tracking disabled.",
          );
        }
      })
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
          // If data has optional shape_dist_traveled header -> save traveled distance by stop
          if (hasDistanceData) {
            if (
              !Object.hasOwn(
                tripToSequenceMap[tripId],
                "stop_distance_traveled",
              )
            ) {
              tripToSequenceMap[tripId].stop_distance_traveled = [];
            }
            const distanceTraveledByStop = row.shape_dist_traveled
              ? parseFloat(row.shape_dist_traveled)
              : null;

            tripToSequenceMap[tripId].stop_distance_traveled.push(
              distanceTraveledByStop,
            );
          }
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

    /*
     * Per-trip destination signs, deduped.
     *
     * A pattern is a stop sequence, and its trips almost always share one
     * headsign — but not always. HSL's rail line H runs Helsinki→Siuntio as a
     * single pattern where 80 trips are signed "Siuntio-Hanko" (they continue
     * beyond) and 35 are signed "Siuntio". Both are correct for their own
     * trips, so a departure board needs the trip's own sign, not the
     * pattern's.
     *
     * Stored as an index because the whole feed uses only ~300 distinct
     * strings across 341,000 trips.
     */
    const headsignValues = [];
    const headsignIndexByValue = new Map();
    const headsignByTrip = [];

    // Phase 1: Grouping - Loop through every parsed trip to establish unique routes and assign trips to service buckets
    for (const stringTripId in tripToSequenceMap) {
      const tripData = tripToSequenceMap[stringTripId];
      const stopSequence = tripData.stops;
      const serviceId = tripData.service_id;
      const stopDistanceTraveled = Object.hasOwn(
        tripData,
        "stop_distance_traveled",
      )
        ? tripData.stop_distance_traveled
        : null;

      // Create a unique text signature for each route based on its stop sequence
      const routeSignature = stopSequence.join("-");

      // Enforce early trip mapping token generation
      if (tripMapping[stringTripId] === undefined) {
        tripMapping[stringTripId] = uniqueTripCounter++;
      }
      const tokenizedTripIntId = tripMapping[stringTripId];

      if (tripData.headsign !== undefined) {
        let headsignIndex = headsignIndexByValue.get(tripData.headsign);
        if (headsignIndex === undefined) {
          headsignIndex = headsignValues.length;
          headsignValues.push(tripData.headsign);
          headsignIndexByValue.set(tripData.headsign, headsignIndex);
        }
        headsignByTrip[tokenizedTripIntId] = headsignIndex;
      }

      if (!routeGroups[routeSignature]) {
        // A new route has been found, initialize its structural properties
        const agencyRouteId = tripData.agency_route_id;
        const agencyRouteType = routeTypesMap[agencyRouteId];
        const routeShortName = routeNamesMap[agencyRouteId];
        const stopOrderMap = {};

        stopSequence.forEach((stopId, stopOrder) => {
          stopOrderMap[stopId] = stopOrder;
        });
        const routeObject = {
          route_id: uniqueRouteCounter,
          agency_route_id: agencyRouteId,
          short_name: routeShortName,
          route_type: agencyRouteType,
          stop_ids: stopSequence,
          stop_order_map: stopOrderMap,
          service_buckets: {},
        };
        if (stopDistanceTraveled) {
          routeObject["stop_distance_traveled"] = stopDistanceTraveled;
        }
        const longName = routeLongNamesMap[agencyRouteId];
        if (longName !== undefined) {
          routeObject.long_name = longName;
        }

        /*
         * Non-enumerable so they never reach the JSON. They exist only while
         * the pattern is being assembled and are resolved into real fields in
         * Phase 3.
         */
        Object.defineProperties(routeObject, {
          _directions: { value: new Set(), writable: true },
          _headsigns: { value: new Set(), writable: true },
          _shapeCounts: { value: new Map(), writable: true },
          _tripCount: { value: 0, writable: true },
        });

        routeGroups[routeSignature] = routeObject;
        uniqueRouteCounter++;
      }

      const group = routeGroups[routeSignature];
      group._tripCount++;
      if (tripData.direction_id !== undefined) {
        group._directions.add(tripData.direction_id);
      }
      if (tripData.headsign !== undefined) {
        group._headsigns.add(tripData.headsign);
      }
      if (tripData.shape_id !== undefined) {
        group._shapeCounts.set(
          tripData.shape_id,
          (group._shapeCounts.get(tripData.shape_id) || 0) + 1,
        );
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

        // Initialize the cache-friendly parallel bucket architecture
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

    /*
     * Phase 3: Resolution - Turn the per-trip metadata gathered in Phase 1
     * into pattern-level fields, but only where the pattern's trips actually
     * agree. A field that would have to be guessed is left off entirely.
     */
    let patternsWithDirection = 0;
    let patternsWithHeadsign = 0;
    let patternsWithMixedHeadsign = 0;

    for (const signature in routeGroups) {
      const routeData = routeGroups[signature];

      routeData.trip_count = routeData._tripCount;

      /*
       * A pattern is one stop sequence, so its trips run one way and share a
       * direction. That is a property of the data, not an assumption: across
       * HSL's 1,179 patterns, none mixes directions. Anything that did would
       * be left undirected rather than assigned a coin-flip value.
       */
      if (routeData._directions.size === 1) {
        routeData.direction_id = [...routeData._directions][0];
        patternsWithDirection++;
      }

      /*
       * Only set when every trip agrees. Where they do not, the pattern has no
       * single destination and consumers should read the trip's own sign from
       * trip-headsigns.processed.json.
       */
      if (routeData._headsigns.size === 1) {
        routeData.headsign = [...routeData._headsigns][0];
        patternsWithHeadsign++;
      } else if (routeData._headsigns.size > 1) {
        patternsWithMixedHeadsign++;
      }

      /*
       * A representative shape for drawing the line, not an exact one: 76 of
       * HSL's patterns have trips on more than one shape (diversions, partial
       * geometries), so the most-used shape is chosen. Journey legs do not use
       * this — they slice the trip's own shape via trip-to-shape-mapping.
       */
      if (routeData._shapeCounts.size > 0) {
        let bestShape = null;
        let bestCount = -1;
        for (const [shapeId, count] of routeData._shapeCounts) {
          if (count > bestCount) {
            bestShape = shapeId;
            bestCount = count;
          }
        }
        routeData.shape_id = bestShape;
      }
    }

    // Convert the routes map into a clean flat array
    const finalRoutesArray = Object.values(routeGroups);

    console.log(
      `Saving ${finalRoutesArray.length} compiled RAPTOR routes to disk...`,
    );
    // Create routes output file (if non existing), stringify the 'finalRoutesArray' & write to its output file
    fs.writeFileSync(routesOutputPath, JSON.stringify(finalRoutesArray));
    console.log(`Saving Trip token mapping configuration dictionary...`);
    // Create trip mapping output file (if non existing), stringify the 'tripMapping' & write to its output file

    fs.writeFileSync(tripMappingOutputPath, JSON.stringify(tripMapping));

    if (headsignValues.length > 0) {
      console.log(
        `Saving ${headsignValues.length} distinct destination signs across ${headsignByTrip.length} trips...`,
      );
      fs.writeFileSync(
        tripHeadsignsOutputPath,
        JSON.stringify({ values: headsignValues, by_trip: headsignByTrip }),
      );
    } else {
      // No headsigns in this feed: remove any file left by a previous network.
      fs.rmSync(tripHeadsignsOutputPath, { force: true });
      console.log("Feed has no trip_headsign column. Skipping headsign index.");
    }

    console.log(
      `Successfully compiled and formatted ${finalRoutesArray.length} routes.`,
    );
    console.log(
      `  Optional 'long_name':    ${availability.routeLongName ? "present" : "absent from this feed"}`,
    );
    console.log(
      `  Optional 'direction_id': ${
        availability.directionId
          ? `resolved on ${patternsWithDirection}/${finalRoutesArray.length} patterns`
          : "absent from this feed"
      }`,
    );
    console.log(
      `  Optional 'headsign':     ${
        availability.tripHeadsign
          ? `resolved on ${patternsWithHeadsign}/${finalRoutesArray.length} patterns` +
            (patternsWithMixedHeadsign > 0
              ? `, ${patternsWithMixedHeadsign} vary by trip`
              : "")
          : "absent from this feed"
      }`,
    );
    console.log(
      `  Optional 'shape_id':     ${availability.shapeId ? "present" : "absent from this feed"}`,
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
