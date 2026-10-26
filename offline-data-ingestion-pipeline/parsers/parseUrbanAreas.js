const fs = require("fs");
const path = require("path");
// Custom dynamic configuration
const config = require("../pipelineConfig");

// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;

const inputPath = path.join(
  __dirname,
  `../../raw-data/${activeNetwork}-urban-areas/urban-areas.geojson`,
);
const outputPath = path.join(
  __dirname,
  `../../processed-data/${activeNetwork}-processed-data/urban-areas.processed.json`,
);

/*
 * The built-up land around the network's stops, from OpenStreetMap — fetched
 * by `scripts/urban-areas/urban_areas.py` — as a plain array of outer rings,
 * each an array of [lon, lat]:
 *
 *   [ [[35.73, 30.19], [35.74, 30.19], ...], ... ]
 *
 * The backend's service area takes in every town a bus reaches from this, so
 * a point anywhere in Ma'an can be planned from, not only near its terminal.
 * Which towns count is the backend's decision, against the stops; this only
 * compiles what was fetched.
 *
 * Optional: without the GeoJSON this writes an empty array, and the area is
 * the stops' walking reach alone — and the file is always written, so one left
 * over from an earlier fetch cannot outlive it.
 */
console.log("\x1b[34m%s\x1b[0m", "\nUrban Area Parsing Started.\n", "\x1b[0m");

const rings = [];

if (!fs.existsSync(inputPath)) {
  console.log(
    `No '${path.basename(inputPath)}' for ${activeNetwork.toUpperCase()}: the service area is the stops' walking reach alone.`,
  );
} else {
  const collection = JSON.parse(fs.readFileSync(inputPath));
  for (const feature of collection.features ?? []) {
    const ring = feature?.geometry?.coordinates?.[0];
    if (feature?.geometry?.type !== "Polygon" || !Array.isArray(ring)) continue;
    if (ring.length < 4) continue;
    if (
      !ring.every(
        (point) =>
          Array.isArray(point) &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]),
      )
    ) {
      continue;
    }
    rings.push(ring.map(([lon, lat]) => [lon, lat]));
  }
  console.log(`Successfully compiled ${rings.length} built-up areas.`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(rings));
console.log("\x1b[34m%s\x1b[0m", "\nUrban Area Parsing Finished.\n");
