const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
// Custom dynamic configuration
const config = require("../pipelineConfig");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;
const inputPath = path.join(
  __dirname,
  `../raw-data/${activeNetwork}-gtfs-data/stop_times.txt`,
);
const outputPath = path.join(
  __dirname,
  `../processed-data/${activeNetwork}-processed-data/timetables.processed.json`,
);

function timeStringToTimeOfDayInSeconds(timestamp) {
  // Converts a 24-hour time string into total seconds of the day.
  return timestamp
    .split(":")
    .reduce((acc, time) => acc * 60 + parseInt(time), 0);
}

console.log("\x1b[34m%s\x1b[0m", "\nTimetable Parsing Started.\n");

const tripToTimesMap = {};
console.log("Streaming stop_times.txt to parse trip timetables");
fs.createReadStream(inputPath)
  .pipe(
    csv({
      // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
      mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
    }),
  )
  .on("data", (row) => {
    // Pipeline rule validation: Ensure required properties exits in raw data
    if (!row.trip_id || !row.arrival_time || !row.departure_time) {
      console.error(
        "Data Ingestion Error: GTFS stop_times.txt is missing a required base property",
      );
      process.exit(1);
    }
    // Extracting specific information from raw data
    const tripId = row.trip_id;
    const rawArrivalTime = row.arrival_time;
    const rawDepartureTime = row.departure_time;
    // Converting arrival and departure times into RAPTOR-suitable format
    const arrivalTime = timeStringToTimeOfDayInSeconds(rawArrivalTime);
    const departureTime = timeStringToTimeOfDayInSeconds(rawDepartureTime);
    if (!tripToTimesMap[tripId]) {
      tripToTimesMap[tripId] = [];
    }
    tripToTimesMap[tripId].push({
      arrival: arrivalTime,
      departure: departureTime,
    });
  })
  // Data read from original file is finished
  .on("end", () => {
    // Create timetable output file (if non existing), stringify the 'tripToTimesMap' & write to its output file (NOT using arg '2' for indentation because of memory limits)
    fs.writeFileSync(outputPath, JSON.stringify(tripToTimesMap));

    console.log(
      `Successfully parsed ${Object.keys(tripToTimesMap).length} trips.`,
    );

    console.log("\x1b[34m%s\x1b[0m", "\nTimetable Parsing Finished.\n");
  })
  .on("error", (err) => {
    // Catch any error while extracting data
    console.error("Parsing Timetables Failed: ", err);
  });
