const express = require("express");
const router = express.Router();
const AppError = require("../utils/AppError");
const logCalculationTime = require("../utils/logCalculationTime");
const { searchStops } = require("../utils/stopSearchIndex");

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const MAX_QUERY_LENGTH = 100;

/*
 * Stops by name, for a place search to offer alongside addresses.
 *
 * Matches the feed's own name and every translation the feed carries, so an
 * Arabic query finds a stop the feed names in English. Each result is the
 * usual stop shape plus `modes` (as `/api/stops`) and `translations`, an
 * object of the stop's name by language — `{}` when the feed has none.
 *
 * `q` is required; `limit` is clamped to 1–20 and defaults to 10, read the way
 * the departure board reads its own. `truncated` says more matched than were
 * returned.
 */
router.get("/", (req, res) => {
  const startedAt = performance.now();
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (query === "" || query.length > MAX_QUERY_LENGTH) {
    throw new AppError(400, "BAD_QUERY", `Must provide \`q\`, 1 to ${MAX_QUERY_LENGTH} characters.`);
  }

  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const { stops, truncated } = searchStops(query, limit);

  logCalculationTime(`Stop Search (${stops.length} stops)`, startedAt);
  res.json({ stops, total: stops.length, truncated });
});

module.exports = router;
