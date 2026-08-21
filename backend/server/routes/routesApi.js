const express = require("express");
const router = express.Router();

const { getCache, getCapabilities } = require("../../memoryCache");
const convertSecondsToTimeOfDay = require("../utils/convertSecondsToTimeOfDay");
const { lineIdFor } = require("../utils/lineIdentity");

const cache = getCache();
const capabilities = getCapabilities();

/*
 * Route inspection.
 *
 * The compiled data holds 1,179 stop-sequence *patterns*, not 464 lines — a
 * RAPTOR route is one exact sequence, so every variant and every direction is
 * its own record. Riders think in lines, so lines are what this endpoint
 * lists, with the patterns behind them exposed as variants.
 *
 * Where the feed supplies direction_id, a line's variants split cleanly into
 * two directions and a client can offer a flip. Where it does not, the
 * variants are still listed and labelled by their end points; nothing here
 * invents a direction it cannot prove.
 */

/**
 * Case- and diacritic-insensitive matching, so "hameentie" finds "Hämeentie".
 * Unicode property escapes are safely inside the supported baseline.
 */
function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Lines, built once at boot — the patterns never change while running. */
const linesById = (() => {
  const lines = new Map();

  cache.routes.forEach((route, patternId) => {
    if (!route?.stop_ids?.length) return;

    const lineId = lineIdFor(route);
    if (!lines.has(lineId)) {
      lines.set(lineId, {
        lineId,
        routeShortName: route.short_name,
        routeType: route.route_type,
        routeLongName: route.long_name ?? null,
        patterns: [],
      });
    }

    const line = lines.get(lineId);
    // Any variant can carry the long name; the first one that has it wins.
    if (line.routeLongName === null && route.long_name !== undefined) {
      line.routeLongName = route.long_name;
    }
    line.patterns.push({ patternId, route });
  });

  return lines;
})();

/**
 * The window a pattern operates in, across every service it runs on.
 *
 * Taken from origin departures rather than departures at any stop, so it reads
 * as "first and last vehicle of the day" for the line as a whole. Not
 * date-specific: it describes the pattern's overall span, which is what a line
 * page is for.
 */
function operatingSpan(route) {
  let earliest = null;
  let latest = null;

  for (const bucket of Object.values(route.service_buckets ?? {})) {
    const originDepartures = Array.isArray(bucket) ? null : bucket?.["0"];
    if (!Array.isArray(originDepartures) || originDepartures.length === 0) {
      continue;
    }
    // Buckets are sorted by origin departure, so the ends are the extremes.
    const first = originDepartures[0];
    const last = originDepartures[originDepartures.length - 1];
    if (earliest === null || first < earliest) earliest = first;
    if (latest === null || last > latest) latest = last;
  }

  return {
    firstDeparture:
      earliest === null ? null : convertSecondsToTimeOfDay(earliest, "floor"),
    lastDeparture:
      latest === null ? null : convertSecondsToTimeOfDay(latest, "ceil"),
  };
}

/** Summary of one variant — enough to choose between them, without the stops. */
function describeVariant({ patternId, route }) {
  const originStop = cache.stops[route.stop_ids[0]];
  const terminusStop = cache.stops[route.stop_ids[route.stop_ids.length - 1]];

  return {
    /*
     * Index into the compiled patterns. Stable for the life of a dataset but
     * not across a pipeline re-run, so a client holding one across a data
     * refresh should fall back to the line's first variant rather than error.
     */
    patternId,
    directionId: route.direction_id ?? null,
    /** The feed's own destination sign, null when it carries none. */
    headsign: route.headsign ?? null,
    originStopName: originStop?.name ?? null,
    terminusStopName: terminusStop?.name ?? null,
    stopCount: route.stop_ids.length,
    /** Ranks the everyday service above short workings and depot runs. */
    tripCount: route.trip_count ?? null,
    ...operatingSpan(route),
  };
}

/** The public shape of a stop along a pattern. */
function describePatternStop(internalStopId, index, route) {
  const stop = cache.stops[internalStopId];
  if (!stop) return null;

  const described = {
    id: stop.gtfs_id,
    name: stop.name,
    code: stop.stop_code ?? null,
    lat: stop.lat,
    lon: stop.lon,
    description: stop.desc ?? null,
    fareZone: stop.zone ?? null,
    wheelchairAccessible:
      stop.wheelchair === undefined ? null : stop.wheelchair === 1,
    sequence: index,
  };

  /*
   * Distance travelled from the origin. The pipeline compiles this in
   * kilometres only when the feed supplies shape_dist_traveled, so it is null
   * for a feed without it — the same rule transitDistanceMeters follows.
   */
  const distanceKm = route.stop_distance_traveled?.[index];
  described.distanceFromOriginMeters =
    typeof distanceKm === "number" ? Math.round(distanceKm * 1000) : null;

  return described;
}

/*
 * All lines, newest-rider-first: designation order, not pattern order.
 * GET /api/routes?q=&mode=
 */
router.get("/", (req, res) => {
  try {
    const query = fold(req.query.q ?? "").trim();
    const mode =
      req.query.mode === undefined
        ? null
        : Number.parseInt(req.query.mode, 10);

    const lines = [...linesById.values()]
      .filter((line) => {
        if (mode !== null && !Number.isNaN(mode) && line.routeType !== mode) {
          return false;
        }
        if (query.length === 0) return true;
        return (
          fold(line.routeShortName).includes(query) ||
          fold(line.routeLongName).includes(query)
        );
      })
      .map((line) => {
        const directions = [
          ...new Set(
            line.patterns
              .map(({ route }) => route.direction_id)
              .filter((direction) => direction !== undefined),
          ),
        ].sort();

        return {
          lineId: line.lineId,
          routeShortName: line.routeShortName,
          routeType: line.routeType,
          routeLongName: line.routeLongName,
          variantCount: line.patterns.length,
          /*
           * Which directions exist for this line. Two entries means a client
           * can offer a direction flip; fewer means it should fall back to
           * labelling variants by their end points.
           */
          directions,
        };
      })
      .sort((a, b) =>
        a.routeShortName.localeCompare(b.routeShortName, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );

    res.json({ lines, totalLines: lines.length, capabilities });
  } catch (error) {
    console.error("[Routes Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve routes.",
    });
  }
});

/*
 * One line and its variants.
 * GET /api/routes/:lineId
 */
router.get("/:lineId", (req, res) => {
  try {
    const line = linesById.get(req.params.lineId);
    if (!line) {
      return res
        .status(404)
        .json({ errorCode: "LINE_NOT_FOUND", error: "Line not found." });
    }

    // Busiest first, so the everyday service leads and short workings follow.
    const variants = line.patterns
      .map(describeVariant)
      .sort((a, b) => (b.tripCount ?? 0) - (a.tripCount ?? 0));

    res.json({
      lineId: line.lineId,
      routeShortName: line.routeShortName,
      routeType: line.routeType,
      routeLongName: line.routeLongName,
      directions: [
        ...new Set(
          variants
            .map((variant) => variant.directionId)
            .filter((direction) => direction !== null),
        ),
      ].sort(),
      variants,
      capabilities,
    });
  } catch (error) {
    console.error("[Line Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve line.",
    });
  }
});

/*
 * One variant in full — its stop sequence and geometry.
 * GET /api/routes/:lineId/:patternId
 */
router.get("/:lineId/:patternId", (req, res) => {
  try {
    const line = linesById.get(req.params.lineId);
    if (!line) {
      return res
        .status(404)
        .json({ errorCode: "LINE_NOT_FOUND", error: "Line not found." });
    }

    const patternId = Number.parseInt(req.params.patternId, 10);
    const pattern = line.patterns.find(
      (candidate) => candidate.patternId === patternId,
    );
    if (!pattern) {
      return res.status(404).json({
        errorCode: "PATTERN_NOT_FOUND",
        error: "Variant not found on this line.",
      });
    }

    const { route } = pattern;

    /*
     * A representative geometry, not an exact one: trips on a pattern can use
     * different shapes, so the pipeline stores the most-used. Null for a feed
     * without shapes.txt, in which case a client draws stop-to-stop instead.
     */
    const shape =
      route.shape_id !== undefined
        ? (cache.shapes?.[route.shape_id] ?? null)
        : null;

    res.json({
      lineId: line.lineId,
      routeShortName: line.routeShortName,
      routeType: line.routeType,
      routeLongName: line.routeLongName,
      ...describeVariant(pattern),
      stops: route.stop_ids
        .map((internalStopId, index) =>
          describePatternStop(internalStopId, index, route),
        )
        .filter((stop) => stop !== null),
      shape,
      capabilities,
    });
  } catch (error) {
    console.error("[Pattern Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve line variant.",
    });
  }
});

module.exports = router;

/* example usages:
http://localhost:3000/api/routes
http://localhost:3000/api/routes?q=kamppi&mode=3
http://localhost:3000/api/routes/tram-4T

Variant URLs take a patternId belonging to that line — read one from the
line's own `variants`, do not guess. tram-4T owns patterns 51 and 52; pattern 12
belongs to tram-1T, so asking for it under 0-4T is correctly a 404:
http://localhost:3000/api/routes/tram-4T/51
*/
