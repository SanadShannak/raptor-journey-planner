const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const convertDateIdToDateObject = require("../utils/convertDateIdToDateObject");
const convertDateObjectToDateId = require("../utils/convertDateObjectToDateId");
// Custom dynamic configuration
const config = require("../pipelineConfig");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

const calendarInputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data/calendar.txt`,
);
const exceptionsInputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data/calendar_dates.txt`,
);
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/active-services.processed.json`,
);

const mappingPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/service-mapping.processed.json`,
);

console.log("\x1b[34m%s\x1b[0m", "\nActive Services Parsing Started.\n");
console.log(
  `Initializing Active Services Builder for network [${activeNetwork.toUpperCase()}]...`,
);

// String-to-Integer Service Map
const serviceIdMap = {};
let serviceFlatIdCounter = 0;
const dateToServices = {};

// Reading raw data from GTFS file and pipelining into csv reader
fs.createReadStream(calendarInputPath)
  .pipe(
    csv({
      // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
      mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
    }),
  )
  .on("data", (row) => {
    // Pipeline rule validation: Ensure required properties exits in raw data
    if (
      !row.service_id ||
      !row.start_date ||
      !row.end_date ||
      !row.sunday ||
      !row.monday ||
      !row.tuesday ||
      !row.wednesday ||
      !row.thursday ||
      !row.friday ||
      !row.saturday
    ) {
      console.error(
        "Data Ingestion Error: GTFS calendar.txt is missing a required base property",
      );
      process.exit(1);
    }
    // Extracting specific information from raw data
    const serviceId = row.service_id;
    const serviceStartDate = row.start_date;
    const serviceEndDate = row.end_date;
    const serviceStartDateObject = convertDateIdToDateObject(serviceStartDate);
    const serviceEndDateObject = convertDateIdToDateObject(serviceEndDate);

    // Enforce early service mapping token generation
    if (!Object.hasOwn(serviceIdMap, serviceId)) {
      serviceIdMap[serviceId] = serviceFlatIdCounter;
    }
    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    const activeDays = {
      monday: row.monday === "1",
      tuesday: row.tuesday === "1",
      wednesday: row.wednesday === "1",
      thursday: row.thursday === "1",
      friday: row.friday === "1",
      saturday: row.saturday === "1",
      sunday: row.sunday === "1",
    };

    let currentDate = new Date(serviceStartDateObject.valueOf());

    // Loop through every day in the date range to populate the global date index
    while (currentDate <= serviceEndDateObject) {
      const currentDayName = currentDate
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase();
      if (activeDays[currentDayName]) {
        const currentDateId = convertDateObjectToDateId(currentDate);
        if (!Object.hasOwn(dateToServices, currentDateId)) {
          dateToServices[currentDateId] = [];
        }
        dateToServices[currentDateId].push(serviceFlatIdCounter);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    serviceFlatIdCounter++;
  })
  // Data read from original file is finished
  .on("end", () => {
    console.log("Successfully extracted baseline schedules from calendar.txt");
    console.log("Streaming calendar_dates.txt to apply exceptions...");

    // Reading raw data from GTFS file and pipelining into csv reader
    fs.createReadStream(exceptionsInputPath)
      .pipe(
        csv({
          // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("data", (row) => {
        // Pipeline rule validation: Ensure required properties exits in raw data
        if (!row.service_id || !row.date || !row.exception_type) {
          console.error(
            "Data Ingestion Error: GTFS calendar_dates.txt is missing a required base property",
          );
          process.exit(1);
        }
        // Extracting specific information from raw data
        const serviceId = row.service_id;

        // Enforce early service mapping token generation
        if (!Object.hasOwn(serviceIdMap, serviceId)) {
          serviceIdMap[serviceId] = serviceFlatIdCounter++;
        }

        const serviceFlatId = serviceIdMap[serviceId];
        const exceptionDateId = row.date;
        const exceptionType = row.exception_type;

        // Handle ADD exceptions
        if (exceptionType === "1") {
          if (!dateToServices[exceptionDateId]) {
            dateToServices[exceptionDateId] = [];
          }
          dateToServices[exceptionDateId].push(serviceFlatId);
        }

        // Handle REMOVE exceptions
        if (exceptionType === "2") {
          if (!dateToServices[exceptionDateId]) {
            console.log(
              "WARNING:Service is being removed from a date that is already empty",
            );
            return;
          }
          const serviceIndex =
            dateToServices[exceptionDateId].indexOf(serviceFlatId);
          if (serviceIndex > -1) {
            dateToServices[exceptionDateId].splice(serviceIndex, 1);
          }
        }
      })
      // Data read from original file is finished
      .on("end", () => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });

        console.log(`Saving compiled Active Services to disk...`);
        // Create active services output file (if non existing), stringify the 'dateToServices' & write to its output file (using arg '2' for indentation)
        fs.writeFileSync(outputPath, JSON.stringify(dateToServices));

        console.log(`Saving Service token mapping configuration dictionary...`);
        // Create mapping output file (if non existing), stringify the 'serviceIdMap' & write to its output file (using arg '2' for indentation)
        fs.writeFileSync(mappingPath, JSON.stringify(serviceIdMap));

        console.log(
          "\x1b[34m%s\x1b[0m",
          "\nActive Services Parsing Finished.\n",
        );
      })
      // Catch any error while extracting data
      .on("error", (err) => {
        console.error("Parsing Active Services Failed: ", err);
      });
  })
  // Catch any error while extracting data
  .on("error", (err) => {
    console.error("Parsing Active Services Failed: ", err);
  });
