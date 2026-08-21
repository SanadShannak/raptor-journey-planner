const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
// Custom dynamic configuration
const config = require("../pipelineConfig");
const { optionalValue } = require("../utils/optionalValue");

/*
 * Compiles the network's own description of itself, plus a manifest of which
 * optional data this feed actually supplied.
 *
 * Runs last on purpose: the capability flags are determined by reading the
 * compiled output rather than the raw feed, so they describe what downstream
 * consumers will really find. A column that exists in the CSV but is blank in
 * every row is absent as far as anything using it is concerned.
 *
 * The timezone is the important part. Every timestamp in this system is
 * wall-clock time in the network's zone, and the feed states that zone itself
 * in agency.txt — so it is derived here rather than hardcoded anywhere.
 */

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

const rawDataDir = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-gtfs-data`,
);
const processedDir = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data`,
);
const outputPath = path.join(processedDir, "network-meta.processed.json");

console.log("\x1b[34m%s\x1b[0m", "\nNetwork Metadata Parsing Started.\n");

/** Reads a whole CSV into memory. These files hold a handful of rows. */
function readCsv(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve([]);
      return;
    }
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(
        csv({
          // Sanitizes headers by stripping hidden BOM characters or non-alphanumeric objects from the start of the column name
          mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim(),
        }),
      )
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", () => resolve([]));
  });
}

/** GTFS writes dates as `YYYYMMDD`; everything downstream expects ISO. */
function toIsoDate(raw) {
  const value = optionalValue(raw);
  if (value === null || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function readJsonIfPresent(fileName) {
  const filePath = path.join(processedDir, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** True when at least one record carries the field. */
function anyRecordHas(records, field) {
  if (!Array.isArray(records)) return false;
  return records.some(
    (record) => record && record[field] !== undefined && record[field] !== null,
  );
}

async function run() {
  const [agencyRows, feedInfoRows] = await Promise.all([
    readCsv(path.join(rawDataDir, "agency.txt")),
    readCsv(path.join(rawDataDir, "feed_info.txt")),
  ]);

  const agency = agencyRows[0] ?? {};
  const feedInfo = feedInfoRows[0] ?? {};

  if (agencyRows.length === 0) {
    console.warn(
      "  No agency.txt found. Timezone and language will be absent; consumers must fall back.",
    );
  }
  if (agencyRows.length > 1) {
    console.log(
      `  Feed lists ${agencyRows.length} agencies. Using the first for network-level metadata.`,
    );
  }

  const stops = readJsonIfPresent("stops.processed.json");
  const routes = readJsonIfPresent("routes.processed.json");
  const hasHeadsignIndex = fs.existsSync(
    path.join(processedDir, "trip-headsigns.processed.json"),
  );
  const hasShapes = fs.existsSync(
    path.join(processedDir, "shapes.processed.json"),
  );

  /*
   * What a consumer can rely on. Anything false here means the UI that would
   * have used it must degrade rather than render an empty field — which is why
   * this is compiled data and not documentation.
   */
  const available = {
    stopCode: anyRecordHas(stops, "stop_code"),
    stopDescription: anyRecordHas(stops, "desc"),
    fareZones: anyRecordHas(stops, "zone"),
    wheelchairAccessibility: anyRecordHas(stops, "wheelchair"),
    routeLongName: anyRecordHas(routes, "long_name"),
    routeDirection: anyRecordHas(routes, "direction_id"),
    routeHeadsign: anyRecordHas(routes, "headsign") || hasHeadsignIndex,
    tripHeadsign: hasHeadsignIndex,
    routeShape: anyRecordHas(routes, "shape_id") && hasShapes,
    transitDistance: anyRecordHas(routes, "stop_distance_traveled"),
  };

  const meta = {
    network: activeNetwork,

    /*
     * IANA zone from the feed. Null is a legitimate answer for a feed without
     * agency.txt; the server falls back to its own configured zone rather than
     * to the host's, which would make timetables read differently depending on
     * where the process happens to run.
     */
    timezone: optionalValue(agency.agency_timezone),

    /**
     * The language stop and route names are written in. Used to mark them up
     * for screen-reader pronunciation and bidi isolation — `fi` for HSL, `ar`
     * for an Amman feed — rather than assuming one language forever.
     */
    language: optionalValue(agency.agency_lang) ?? optionalValue(feedInfo.feed_lang),

    agencyName: optionalValue(agency.agency_name),
    agencyUrl: optionalValue(agency.agency_url),

    // Attribution the consuming app is obliged to display.
    publisherName: optionalValue(feedInfo.feed_publisher_name),
    publisherUrl: optionalValue(feedInfo.feed_publisher_url),

    /*
     * The window the feed claims to cover. Distinct from the dates that
     * actually have service, which come from active-services; a feed can
     * declare a range wider than its calendar fills.
     */
    feedStartDate: toIsoDate(feedInfo.feed_start_date),
    feedEndDate: toIsoDate(feedInfo.feed_end_date),
    feedVersion: optionalValue(feedInfo.feed_version),

    compiledAt: new Date().toISOString(),
    available,
  };

  fs.mkdirSync(processedDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(meta));

  console.log(`  Network:  ${meta.network}`);
  console.log(`  Timezone: ${meta.timezone ?? "(absent — consumer must fall back)"}`);
  console.log(`  Language: ${meta.language ?? "(absent)"}`);
  console.log(`  Agency:   ${meta.agencyName ?? "(absent)"}`);
  console.log(
    `  Feed:     ${meta.feedStartDate ?? "?"} to ${meta.feedEndDate ?? "?"}`,
  );
  console.log("  Available optional data:");
  for (const [capability, present] of Object.entries(available)) {
    console.log(`    ${present ? "yes" : " no"}  ${capability}`);
  }

  console.log("\x1b[34m%s\x1b[0m", "\nNetwork Metadata Parsing Finished.\n");
}

run().catch((error) => {
  console.error("Parsing Network Metadata Failed: ", error);
  process.exit(1);
});
