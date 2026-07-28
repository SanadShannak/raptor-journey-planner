const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// Custom dynamic configuration
const config = require("../pipelineConfig");
const calculateTimeOfDayInSeconds = require("../utils/calculateTimeOfDayInSeconds");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

// Raw GTFS input paths
const rawDataDir = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data`,
);
const shapesInputPath = path.join(rawDataDir, `shapes.txt`);
const stopTimesInputPath = path.join(rawDataDir, `stop_times.txt`);

// Read all files in the directory dynamically to find active trips files
const allFiles = fs.readdirSync(rawDataDir);
const tripFiles = allFiles.filter(
  (file) => file.startsWith("trips") && file.endsWith(".txt"),
);

// Pre-processed data dependencies
const stopProcessedInput = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stops.processed.json`,
);
const stopMappingInput = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stop-mapping.json`,
);
const tripMappingInput = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/trip-mapping.json`,
);

// Final Output Paths for the routing API to consume
const tripShapesOutputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/trip-to-shape-mapping.json`,
);
const shapesOutputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/shapes.processed.json`,
);

console.log(
  `Initializing Trip Shapes Builder for network [${activeNetwork.toUpperCase()}]...`,
);

// Global State Maps
const tripToStopDistancesMap = {};
const shapeToSequenceMap = {};
const tripToShapeIdMap = {};

/**
 * Helper function to peek at the CSV headers without reading the whole file.
 */
function checkHeaders(filePath, requiredHeaders) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve(false);

    let hasHeaders = false;
    const stream = fs
      .createReadStream(filePath)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("headers", (headers) => {
        hasHeaders = requiredHeaders.every((h) => headers.includes(h));
        stream.destroy(); // Stop reading immediately after headers
        resolve(hasHeaders);
      })
      .on("error", () => {
        resolve(false);
      });
  });
}

/**
 * Phase 0: Prerequisite Validation.
 * Makes this entire script gracefully optional. If data is missing, it skips without crashing.
 */
async function verifyPrerequisites() {
  console.log("Verifying GTFS dataset for optional shape compatibility...");

  if (!fs.existsSync(shapesInputPath)) {
    console.log(
      "\x1b[33m%s\x1b[0m",
      "Missing shapes.txt. Shape processing gracefully skipped.",
    );
    return false;
  }

  // Check required headers across all dependent files
  let hasTripHeaders = false;
  if (tripFiles.length > 0) {
    hasTripHeaders = await checkHeaders(path.join(rawDataDir, tripFiles[0]), [
      "trip_id",
      "shape_id",
    ]);
  }

  const hasStopTimesHeaders = await checkHeaders(stopTimesInputPath, [
    "trip_id",
    "stop_id",
    "shape_dist_traveled",
    "stop_sequence",
  ]);
  const hasShapeHeaders = await checkHeaders(shapesInputPath, [
    "shape_id",
    "shape_pt_lat",
    "shape_pt_lon",
    "shape_dist_traveled",
    "shape_pt_sequence",
  ]);

  if (!hasTripHeaders || !hasStopTimesHeaders || !hasShapeHeaders) {
    console.log(
      "\x1b[33m%s\x1b[0m",
      "Missing required shape or sequence headers in GTFS feed. Shape processing gracefully skipped.",
    );
    return false;
  }

  console.log(
    "All shape prerequisites met! Proceeding with optimized shape generation.",
  );
  return true;
}

/**
 * Phase 1: Parses stop_times.txt
 */
function loadTripToStopDistances() {
  return new Promise((resolve, reject) => {
    console.log("Extracting raw stop distances into human-readable format...");

    fs.createReadStream(stopTimesInputPath)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("data", (row) => {
        const rawTripId = row.trip_id;
        const stopId = row.stop_id;
        const stopDistTraveled = parseFloat(row.shape_dist_traveled);
        const stopSequence = parseInt(row.stop_sequence, 10);
        const flatTripId = tripMapping[rawTripId];

        if (flatTripId === undefined) return;

        if (!Object.hasOwn(tripToStopDistancesMap, flatTripId)) {
          tripToStopDistancesMap[flatTripId] = [];
        }

        const stopData = stopsProcessed[stopMapping[stopId]];

        // Store as unified objects so we can sort them by sequence later
        tripToStopDistancesMap[flatTripId].push({
          id: stopData["id"],
          lat: parseFloat(stopData["lat"]),
          lon: parseFloat(stopData["lon"]),
          dist: stopDistTraveled,
          seq: stopSequence,
        });
      })
      .on("end", () => {
        console.log(
          `Successfully loaded ${Object.keys(tripToStopDistancesMap).length} trips' sequential stops.`,
        );
        resolve();
      })
      .on("error", (err) => reject(err));
  });
}

/**
 * Phase 2: Parses shapes.txt
 */
function loadShapeIdSequence() {
  return new Promise((resolve, reject) => {
    console.log("Extracting raw shape polyline coordinates...");

    fs.createReadStream(shapesInputPath)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("data", (row) => {
        const shapeId = row.shape_id;
        const ptLat = parseFloat(row.shape_pt_lat);
        const ptLon = parseFloat(row.shape_pt_lon);
        const ptDistanceTraveled = parseFloat(row.shape_dist_traveled);
        const ptSequence = parseInt(row.shape_pt_sequence, 10);

        if (!Object.hasOwn(shapeToSequenceMap, shapeId)) {
          shapeToSequenceMap[shapeId] = [];
        }

        // Store as unified objects to guarantee sequence sorting later
        shapeToSequenceMap[shapeId].push({
          lat: ptLat,
          lon: ptLon,
          dist: ptDistanceTraveled,
          seq: ptSequence,
        });
      })
      .on("end", () => {
        console.log(
          `Successfully loaded ${Object.keys(shapeToSequenceMap).length} unique shape polylines.`,
        );
        resolve();
      })
      .on("error", (err) => reject(err));
  });
}

/**
 * Phase 3: Parses trips.txt
 */
function loadTripToShapeIdMap() {
  return new Promise((resolve, reject) => {
    let completedFiles = 0;

    tripFiles.forEach((tripFilePath) => {
      const fullTripPath = path.join(rawDataDir, tripFilePath);

      fs.createReadStream(fullTripPath)
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
          }),
        )
        .on("data", (row) => {
          const rawTripId = row.trip_id;
          const shapeId = row.shape_id;
          const flatTripId = tripMapping[rawTripId];

          if (
            flatTripId !== undefined &&
            !Object.hasOwn(tripToShapeIdMap, flatTripId)
          ) {
            tripToShapeIdMap[flatTripId] = shapeId;
          }
        })
        .on("end", () => {
          completedFiles++;
          if (completedFiles === tripFiles.length) {
            console.log(
              `Trip-to-Shape mapping initialized for ${Object.keys(tripToShapeIdMap).length} total trips.`,
            );
            resolve();
          }
        })
        .on("error", (err) => reject(err));
    });
  });
}

/**
 * Phase 4: The Merging Engine.
 */
function compileFinalTripShapesMap() {
  return new Promise((resolve) => {
    console.log(
      "Compiling unified master shapes and dynamically indexing trips...",
    );

    // Step 4.1: Gather all unique stops
    const shapeUniqueStops = {};
    for (const [tripId, tripStopsArray] of Object.entries(
      tripToStopDistancesMap,
    )) {
      const shapeId = tripToShapeIdMap[tripId];
      if (!shapeId) continue;

      if (!shapeUniqueStops[shapeId]) {
        shapeUniqueStops[shapeId] = new Map();
      }

      for (const stop of tripStopsArray) {
        shapeUniqueStops[shapeId].set(stop.id, stop);
      }
    }

    const mergedShapesMap = {};
    const masterStopIndices = {};

    // Step 4.2: Perform the Two-Pointer Merge
    for (const [shapeId, stopsMap] of Object.entries(shapeUniqueStops)) {
      const rawShapePoints = shapeToSequenceMap[shapeId];
      if (!rawShapePoints) continue;

      // BULLETPROOF SORTING: Strictly enforce dimensions before merge
      const sortedStops = Array.from(stopsMap.values()).sort(
        (a, b) => a.dist - b.dist,
      );
      const sortedShapePoints = rawShapePoints.sort((a, b) => a.seq - b.seq);

      let stopsPointer = 0;
      let pointsPointer = 0;
      let shapeListIndexPointer = 0;

      const currentMergedShapeList = [];
      const currentStopIndexMap = {};

      const stopsLength = sortedStops.length;
      const pointsLength = sortedShapePoints.length;

      // The Two-Pointer Merge Logic
      while (stopsPointer < stopsLength && pointsPointer < pointsLength) {
        const stopDist = sortedStops[stopsPointer].dist;
        const ptDist = sortedShapePoints[pointsPointer].dist;

        if (stopDist < ptDist) {
          currentMergedShapeList.push([
            sortedStops[stopsPointer].lat,
            sortedStops[stopsPointer].lon,
          ]);
          currentStopIndexMap[sortedStops[stopsPointer].id] =
            shapeListIndexPointer;
          shapeListIndexPointer++;
          stopsPointer++;
        } else if (ptDist < stopDist) {
          currentMergedShapeList.push([
            sortedShapePoints[pointsPointer].lat,
            sortedShapePoints[pointsPointer].lon,
          ]);
          shapeListIndexPointer++;
          pointsPointer++;
        } else {
          currentMergedShapeList.push([
            sortedStops[stopsPointer].lat,
            sortedStops[stopsPointer].lon,
          ]);
          currentStopIndexMap[sortedStops[stopsPointer].id] =
            shapeListIndexPointer;
          shapeListIndexPointer++;
          stopsPointer++;
          pointsPointer++;
        }
      }

      while (stopsPointer < stopsLength) {
        currentMergedShapeList.push([
          sortedStops[stopsPointer].lat,
          sortedStops[stopsPointer].lon,
        ]);
        currentStopIndexMap[sortedStops[stopsPointer].id] =
          shapeListIndexPointer;
        shapeListIndexPointer++;
        stopsPointer++;
      }

      while (pointsPointer < pointsLength) {
        currentMergedShapeList.push([
          sortedShapePoints[pointsPointer].lat,
          sortedShapePoints[pointsPointer].lon,
        ]);
        shapeListIndexPointer++;
        pointsPointer++;
      }

      mergedShapesMap[shapeId] = currentMergedShapeList;
      masterStopIndices[shapeId] = currentStopIndexMap;
    }

    // Step 4.3: Distribute indices
    const finalTripsMap = {};
    for (const [tripId, tripStopsArray] of Object.entries(
      tripToStopDistancesMap,
    )) {
      const shapeId = tripToShapeIdMap[tripId];
      if (!shapeId || !masterStopIndices[shapeId]) continue;

      const tripStopIndexMap = {};
      for (const stop of tripStopsArray) {
        tripStopIndexMap[stop.id] = masterStopIndices[shapeId][stop.id];
      }

      finalTripsMap[tripId] = {
        shape_id: shapeId,
        stop_index_in_shape_map: tripStopIndexMap,
      };
    }

    // Step 4.4: Write to disk
    console.log("Writing API shape payloads to disk...");
    fs.writeFileSync(tripShapesOutputPath, JSON.stringify(finalTripsMap));
    fs.writeFileSync(shapesOutputPath, JSON.stringify(mergedShapesMap));

    resolve();
  });
}

/**
 * Pipeline Execution Wrapper
 */
async function runShapeBuildingPipeline() {
  try {
    console.log("\x1b[34m%s\x1b[0m", "\nTrip Shape Builder Started.\n");

    // Load prerequisites into memory globally
    stopsProcessed = JSON.parse(fs.readFileSync(stopProcessedInput));
    stopMapping = JSON.parse(fs.readFileSync(stopMappingInput));
    tripMapping = JSON.parse(fs.readFileSync(tripMappingInput));

    const shouldRun = await verifyPrerequisites();
    if (!shouldRun) {
      // Exit gracefully so the main pipeline runner can continue to the next script
      return;
    }

    await loadTripToStopDistances();
    await loadShapeIdSequence();
    await loadTripToShapeIdMap();
    await compileFinalTripShapesMap();

    console.log("\x1b[34m%s\x1b[0m", "\nTrip Shape Builder Finished.\n");
  } catch (e) {
    console.error("Route Shape Building Pipeline failed: ", e);
    // Explicitly fail process if an unexpected error occurs so pipeline catches it
    process.exit(1);
  }
}

// Global variables set dynamically inside the runner
let stopsProcessed, stopMapping, tripMapping;

runShapeBuildingPipeline();
