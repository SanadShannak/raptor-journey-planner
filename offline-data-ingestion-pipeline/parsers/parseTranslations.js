const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
// Custom dynamic configuration
const config = require("../pipelineConfig");
const { optionalValue } = require("../utils/optionalValue");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

const inputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data/translations.txt`,
);
// Component 1's output: which stops exist, and what each is called in the feed
const stopsPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stops.processed.json`,
);
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/stop-translations.processed.json`,
);

/*
 * Stop names in other languages, keyed by GTFS stop id and then by language:
 *
 *   { "11920": { "ar": "المحطة" }, ... }
 *
 * translations.txt is optional in GTFS and most feeds carry none, so a feed
 * without it compiles to an empty object rather than failing — and the file is
 * always written, so one left over from an earlier feed cannot outlive it.
 *
 * Only stop names are compiled; the rest of the table (route names, headsigns)
 * is ignored until something needs it. Both of the spec's ways of naming the
 * record are accepted: `record_id` (this stop) and `field_value` (every stop
 * whose name is exactly this).
 */
const stops = JSON.parse(fs.readFileSync(stopsPath));
const knownStopIds = new Set(stops.map((stop) => stop.gtfs_id));
const stopIdsByName = new Map();
for (const stop of stops) {
  if (!stopIdsByName.has(stop.name)) stopIdsByName.set(stop.name, []);
  stopIdsByName.get(stop.name).push(stop.gtfs_id);
}

const translations = {};
let translatedCount = 0;

function addTranslation(stopId, language, name) {
  if (!translations[stopId]) translations[stopId] = {};
  // The first one given wins, so a record_id row is never overwritten by a
  // field_value row that happens to come after it.
  if (translations[stopId][language] !== undefined) return;
  translations[stopId][language] = name;
  translatedCount++;
}

function writeOutput() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(translations));
}

console.log("\x1b[34m%s\x1b[0m", "\nTranslation Parsing Started.\n", "\x1b[0m");

if (!fs.existsSync(inputPath)) {
  writeOutput();
  console.log(
    `No '${path.basename(inputPath)}' for ${activeNetwork.toUpperCase()}: stop names stay in the feed's own language.`,
  );
  console.log("\x1b[34m%s\x1b[0m", "\nTranslation Parsing Finished.\n");
} else {
  console.log(
    `Opening '${path.basename(inputPath)}' for ${activeNetwork.toUpperCase()} network and compiling stop names...`,
  );

  fs.createReadStream(inputPath)
    .pipe(
      csv({
        // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
        mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
      }),
    )
    .on("data", (row) => {
      if (row.table_name !== "stops" || row.field_name !== "stop_name") return;

      const language = optionalValue(row.language);
      const name = optionalValue(row.translation);
      if (language === null || name === null) return;

      const recordId = optionalValue(row.record_id);
      if (recordId !== null) {
        if (knownStopIds.has(recordId)) addTranslation(recordId, language, name);
        return;
      }

      const fieldValue = optionalValue(row.field_value);
      for (const stopId of stopIdsByName.get(fieldValue) ?? []) {
        addTranslation(stopId, language, name);
      }
    })
    .on("end", () => {
      writeOutput();
      console.log(
        `Successfully compiled ${translatedCount} translated stop names for ${Object.keys(translations).length} stops.`,
      );
      console.log("\x1b[34m%s\x1b[0m", "\nTranslation Parsing Finished.\n");
    })
    // Catch any error while extracting data
    .on("error", (err) => {
      console.error("Parsing Translations Failed: ", err);
      process.exit(1);
    });
}
