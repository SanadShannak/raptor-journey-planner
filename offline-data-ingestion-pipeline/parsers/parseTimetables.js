const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const calculateTimeOfDayInSeconds = require("../utils/calculateTimeOfDayInSeconds");
// Custom dynamic configuration
const config = require("../pipelineConfig");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

const stopTimesInputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data/stop_times.txt`,
);
const tripMap = require(
  `../../processed-data/${activeNetwork}-processed-data/trip-mapping.json`,
);
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/timetables.processed.json`,
);

console.log("\x1b[34m%s\x1b[0m", "\nTimetable Parsing Started.\n");

// Pre-allocate our target output container as a clean flat array list
const finalTimetableArray = [];
// Temporary storage to hold stop sequence data per trip before sorting
const tripStopsMap = {};

console.log("Streaming stop_times.txt to parse trip timetables");
fs.createReadStream(stopTimesInputPath)
  .pipe(
    csv({
      // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
      mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
    }),
  )
  .on("data", (row) => {
    // Pipeline rule validation: Ensure required properties exits in raw data
    if (
      !row.trip_id ||
      !row.arrival_time ||
      !row.departure_time ||
      !row.stop_sequence
    ) {
      console.error(
        "Data Ingestion Error: GTFS stop_times.txt is missing a required base property",
      );
      process.exit(1);
    }
    // Extracting specific information from raw data

    const stringTripId = row.trip_id;
    // Convert string trip ID to its designated integer index location
    const tripIntId = tripMap[stringTripId];
    // Safety guard if trip files did not match up cleanly across GTFS sets
    if (tripIntId === undefined) return;
    const rawArrivalTime = row.arrival_time;
    const rawDepartureTime = row.departure_time;
    // Converting arrival and departure times into RAPTOR-suitable format
    const arrivalTime = calculateTimeOfDayInSeconds(rawArrivalTime);
    const departureTime = calculateTimeOfDayInSeconds(rawDepartureTime);
    const stopSequence = parseInt(row.stop_sequence, 10);

    if (!tripStopsMap[tripIntId]) {
      tripStopsMap[tripIntId] = [];
    }
    tripStopsMap[tripIntId].push({
      stopSequence,
      arrival: arrivalTime,
      departure: departureTime,
    });
  })
  // Data read from original file is finished
  .on("end", () => {
    // Ensure every trip's stops are strictly ordered by stop_sequence
    for (const [tripIntIdStr, stops] of Object.entries(tripStopsMap)) {
      const tripIntId = Number(tripIntIdStr);
      stops.sort((a, b) => a.stopSequence - b.stopSequence);
      finalTimetableArray[tripIntId] = stops.map((s) => ({
        arrival: s.arrival,
        departure: s.departure,
      }));
    }

    console.log(
      "Writing flat, high-density integer-indexed timetables to disk...",
    );
    // Create timetable output file (if non existing), stringify the 'finalTimetableArray' & write to its output file
    fs.writeFileSync(outputPath, JSON.stringify(finalTimetableArray));

    console.log(
      `Successfully parsed ${Object.keys(finalTimetableArray).length} tokenized trip arrays.`,
    );

    console.log("\x1b[34m%s\x1b[0m", "\nTimetable Parsing Finished.\n");
  })
  .on("error", (err) => {
    // Catch any error while extracting data
    console.error("Parsing Timetables Failed: ", err);
  });
