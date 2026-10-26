const express = require("express");
const router = express.Router();
const logCalculationTime = require("../utils/logCalculationTime");
const { getServiceArea } = require("../utils/serviceArea");

/*
 * Where on the ground a journey can start or end, for a map to outline.
 *
 * A GeoJSON Feature whose MultiPolygon covers everywhere within walking reach
 * of a stop something calls at — the same reach the planner tests before it
 * answers ORIGIN_OUT_OF_BOUNDS or DESTINATION_OUT_OF_BOUNDS. It is drawn a
 * little inside the true edge, so a point inside it is never refused for being
 * out of the network. `geometry` is null for a feed with no served stops.
 *
 * Computed once, on first request, from the stops already in memory; it
 * cannot drift from the loaded feed the way a file built beside it could.
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
