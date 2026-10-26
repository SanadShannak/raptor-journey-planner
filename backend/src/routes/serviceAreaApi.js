const express = require("express");
const router = express.Router();
const logCalculationTime = require("../utils/logCalculationTime");
const { getServiceArea } = require("../utils/serviceArea");

/*
 * Where on the ground a journey can start or end, for a map to outline.
 *
 * A GeoJSON Feature whose MultiPolygon is the shape of each town the network
 * serves — see `serviceArea.js`. It is the planner's own rule: a point inside
 * is planned from its nearest stops, and a point outside is answered
 * ORIGIN_OUT_OF_BOUNDS or DESTINATION_OUT_OF_BOUNDS. `geometry` is null for a
 * feed with no served stops.
 *
 * Computed at startup from the stops already in memory; it cannot drift from
 * the loaded feed the way a file built beside it could.
 */
router.get("/", (req, res) => {
  const startedAt = performance.now();
  const area = getServiceArea();

  logCalculationTime("Service Area", startedAt);
  res.json(
    area ?? {
      type: "Feature",
      properties: { stopCount: 0, walkingDistanceMeters: null },
      geometry: null,
    },
  );
});

module.exports = router;
