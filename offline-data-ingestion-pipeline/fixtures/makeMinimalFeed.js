const fs = require("fs");
const path = require("path");

/*
 * Writes a deliberately bare GTFS feed, for proving the pipeline and server
 * are feed-agnostic.
 *
 * It carries only the columns pipelineConfig marks required and nothing else:
 * no agency.txt, no feed_info.txt, no shapes.txt, no stop_code, stop_desc,
 * zone_id, wheelchair_boarding, route_long_name, trip_headsign, direction_id,
 * shape_id, or shape_dist_traveled.
 *
 * Every optional field the system reads should therefore come back null or
 * absent, and nothing should crash. This is the cheapest way to keep that
 * property true as the pipeline grows — a real feed like HSL supplies almost
 * everything, so it cannot demonstrate the fallbacks.
 *
 *   node offline-data-ingestion-pipeline/fixtures/makeMinimalFeed.js
 *   # set ACTIVE_NETWORK to "minimal" in pipelineConfig.js
 *   node offline-data-ingestion-pipeline/runPipeline.js
 *   cd backend && npm start
 *
 * Two deliberate quirks in the data:
 *  - T_OUT_2 departs at 25:00, i.e. 01:00 the following day. It exercises the
 *    after-midnight path, which is easy to get wrong and invisible in a feed
 *    whose weekday and weekend services differ.
 *  - SVC_ALL runs all seven days, so the same service is active yesterday and
 *    today. That is what surfaces a departure board dropping yesterday's
 *    spillover when it treats the two as mutually exclusive.
 */

const outputDir = path.join(
  __dirname,
  "../../raw-data/minimal-gtfs-data",
);

const files = {
  "stops.txt": `stop_id,stop_name,stop_lat,stop_lon
S1,Alpha Square,60.1700,24.9380
S2,Beta Street,60.1750,24.9350
S3,Gamma Park,60.1800,24.9320
S4,Delta Harbour,60.1850,24.9300
`,

  "routes.txt": `route_id,route_short_name,route_type
R1,X1,3
`,

  "trips.txt": `route_id,trip_id,service_id
R1,T_OUT_1,SVC_ALL
R1,T_OUT_2,SVC_ALL
R1,T_BACK_1,SVC_ALL
`,

  "stop_times.txt": `trip_id,stop_id,arrival_time,departure_time,stop_sequence
T_OUT_1,S1,08:00:00,08:00:00,1
T_OUT_1,S2,08:05:00,08:05:00,2
T_OUT_1,S3,08:10:00,08:10:00,3
T_OUT_1,S4,08:15:00,08:15:00,4
T_OUT_2,S1,25:00:00,25:00:00,1
T_OUT_2,S2,25:05:00,25:05:00,2
T_OUT_2,S3,25:10:00,25:10:00,3
T_OUT_2,S4,25:15:00,25:15:00,4
T_BACK_1,S4,09:00:00,09:00:00,1
T_BACK_1,S3,09:05:00,09:05:00,2
T_BACK_1,S2,09:10:00,09:10:00,3
T_BACK_1,S1,09:15:00,09:15:00,4
`,

  "calendar.txt": `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
SVC_ALL,1,1,1,1,1,1,1,20260801,20261231
`,

  "calendar_dates.txt": `service_id,date,exception_type
SVC_ALL,20261225,2
`,
};

fs.mkdirSync(outputDir, { recursive: true });
for (const [name, contents] of Object.entries(files)) {
  fs.writeFileSync(path.join(outputDir, name), contents);
}

console.log(`Wrote ${Object.keys(files).length} files to ${outputDir}`);
console.log(
  'Set ACTIVE_NETWORK to "minimal" in pipelineConfig.js, then run runPipeline.js.',
);
