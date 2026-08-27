const express = require("express");
const router = express.Router();

const {
  getCache,
  getCapabilities,
  getTripHeadsign,
} = require("../../memoryCache");
const convertSecondsToTimeOfDay = require("../utils/convertSecondsToTimeOfDay");
const { lineIdFor } = require("../utils/lineIdentity");
const { isValidDate } = require("../utils/inputValidator");
const {
  shiftIsoDate,
  toDateId,
  resolveDateAndTime,
  nowInNetwork,
} = require("../utils/networkTime");

const logCalculationTime = require("../utils/logCalculationTime");

const cache = getCache();
const capabilities = getCapabilities();

const SECONDS_PER_DAY = 86400;

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
 * Every date the feed covers, paired with that date's services as a Set.
 *
 * Built once, for the same reason `linesById` is: the calendar cannot change
 * while the process runs. Sixty Sets is nothing to hold, and it turns "which
 * days does this pattern run" from a scan of the whole calendar per request
 * into sixty cheap membership tests.
 *
 * Ascending, because `Object.keys` on `YYYYMMDD` strings sorts lexically into
 * chronological order — the same trick `validDatesApi` relies on.
 */
const serviceDays = Object.keys(cache.activeServices)
  .sort()
  .map((dateId) => ({
    isoDate: `${dateId.slice(0, 4)}-${dateId.slice(4, 6)}-${dateId.slice(6, 8)}`,
    services: new Set(cache.activeServices[dateId]),
  }));

/**
 * Exactly the dates this pattern runs, ascending.
 *
 * Narrower than `/api/valid-dates`, and deliberately so: that is every day the
 * feed covers, which includes days this line does not run and at least one HSL
 * day whose service list is empty altogether. A date picker offering those
 * invites a choice that comes back empty.
 *
 * The pattern's **own** services only, with no yesterday offset. A pattern
 * whose last trip is 00:30 is not "running" on the following day — it is
 * finishing the previous one — and the thing being chosen here is a service
 * day, not a window of wall clock.
 */
function serviceDatesFor(route) {
  const own = Object.keys(route.service_buckets ?? {}).map((serviceKey) =>
    Number.parseInt(serviceKey, 10),
  );
  if (own.length === 0) return [];

  return serviceDays
    .filter((day) => own.some((serviceId) => day.services.has(serviceId)))
    .map((day) => day.isoDate);
}

/** The services running on a given date, as a Set for cheap membership tests. */
function servicesOn(isoDate) {
  return new Set(cache.activeServices[toDateId(isoDate)] ?? []);
}

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
    /*
     * The days this variant runs. Carried on the summary, not only on the
     * variant in full, because choosing *between* variants needs it: a line's
     * short workings are often seasonal, and a list that cannot tell the one
     * running this week from the one that stopped in August is a list of
     * equally plausible wrong answers.
     */
    serviceDates: serviceDatesFor(route),
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
    /*
     * The designation printed on the stop, the same field a journey leg and a
     * departure board already carry. It was the one thing `describeStop` had
     * that this did not, which meant a line's own stop list was the only place
     * in the API where a track number went missing.
     */
    platform: stop.platform ?? null,
    /*
     * The stop's true position in `stop_ids`, which is **not** its position in
     * the array this ends up in: a stop whose record is missing is dropped, so
     * the list can have holes. This is the key to join against — the `calls`
     * array on a timetable trip is indexed by it.
     */
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
    const startedAt = performance.now();
    const query = fold(req.query.q ?? "").trim();
    const mode =
      req.query.mode === undefined
        ? null
        : Number.parseInt(req.query.mode, 10);

    /*
     * Today's own services, read once per request rather than per line — the
     * index a single route's own page builds at boot exists because the
     * calendar cannot change while the process runs, but "today" moves every
     * request makes this the cheap version of the same idea: one Set, tested
     * against every line's own service ids below.
     */
    const todayServices = new Set(
      cache.activeServices[toDateId(nowInNetwork().date)] ?? [],
    );

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

        /*
         * True the moment any one pattern does — a line is one designation
         * over several patterns, and a rider asking "does this run today"
         * means the line, not whichever one pattern happened to be checked
         * first.
         */
        const activeToday = line.patterns.some(({ route }) =>
          Object.keys(route.service_buckets ?? {}).some((serviceId) =>
            todayServices.has(Number.parseInt(serviceId, 10)),
          ),
        );

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
          activeToday,
        };
      })
      .sort((a, b) =>
        a.routeShortName.localeCompare(b.routeShortName, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );

    logCalculationTime(`Line Index (${lines.length} lines)`, startedAt);
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
    const startedAt = performance.now();
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

    logCalculationTime(`Line ${req.params.lineId}`, startedAt);
    res.json({
      ...describeLine(line),
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

/**
 * The line and variant a request names, or null once the 404 has been sent.
 *
 * Shared by the two handlers that take a `:patternId`, so a variant that does
 * not belong to the line it was asked for is refused the same way on both.
 * Returning null rather than throwing keeps the caller's `if` in the same shape
 * as `resolveStop` in the stops router.
 */
function resolvePattern(req, res) {
  const line = linesById.get(req.params.lineId);
  if (!line) {
    res
      .status(404)
      .json({ errorCode: "LINE_NOT_FOUND", error: "Line not found." });
    return null;
  }

  const patternId = Number.parseInt(req.params.patternId, 10);
  const pattern = line.patterns.find(
    (candidate) => candidate.patternId === patternId,
  );
  if (!pattern) {
    res.status(404).json({
      errorCode: "PATTERN_NOT_FOUND",
      error: "Variant not found on this line.",
    });
    return null;
  }

  return { line, pattern };
}

/** The line-level fields every variant response repeats. */
function describeLine(line) {
  return {
    lineId: line.lineId,
    routeShortName: line.routeShortName,
    routeType: line.routeType,
    routeLongName: line.routeLongName,
  };
}

/**
 * One trip of a pattern, as a time at every stop of it.
 *
 * Read from `cache.timetables`, which holds a trip's own stop times parallel to
 * the pattern's `stop_ids` and carries **arrivals**. The service bucket has
 * departures only, and the two agree, so there is no reason to consult both.
 *
 * `offset` converts the trip's own clock onto the requested date's, and a
 * service is walked under both — yesterday's 25:10 trip is this date's 01:10.
 *
 * **A trip is included when it *overlaps* the date, not when it starts inside
 * it.** Starting inside is the rule a stop's board uses, and it is right there:
 * a board lists departures, and a vehicle that left before midnight is not one
 * you can still catch. A line's page is asked a different question — where are
 * the vehicles, and when does the next one reach each stop — and at ten past
 * midnight the honest answer includes the one that set off at 23:50 and is
 * still halfway down the line. Under the old rule it simply vanished.
 *
 * `serviceDate` says which day's service the trip belongs to, which is not
 * always the date it runs on and cannot be worked out from the times: 00:10 is
 * the tail of yesterday's operation, and a page that reads "runs from 00:10"
 * has been misled by it.
 *
 * Null when the trip has no stop times at all, or when it does not reach the
 * requested date.
 */
function describeTrip(route, flatTripId, baseIsoDate, offset) {
  const stopTimes = cache.timetables[flatTripId];
  if (!Array.isArray(stopTimes)) return null;

  const stopCount = route.stop_ids.length;

  /*
   * The two ends of the run. Neither is always at the array's ends: a pattern's
   * trip can be short a stop time, in which case the parser left a hole rather
   * than a time.
   */
  let originSeconds = null;
  let finalSeconds = null;
  for (let index = 0; index < stopCount; index += 1) {
    const stopTime = stopTimes[index];
    if (!stopTime) continue;
    if (originSeconds === null) originSeconds = stopTime.departure - offset;
    finalSeconds = stopTime.arrival - offset;
  }

  // Overlaps the date: it had not finished when the day began, and it had
  // started before the day ended.
  if (
    originSeconds === null ||
    finalSeconds === null ||
    finalSeconds < 0 ||
    originSeconds >= SECONDS_PER_DAY
  ) {
    return null;
  }

  const calls = [];
  for (let index = 0; index < stopCount; index += 1) {
    const stopTime = stopTimes[index];
    /*
     * A hole, not a dropped entry. `calls` is indexed by the stop's position in
     * the pattern, so removing one would silently shift every stop after it.
     */
    if (!stopTime) {
      calls.push(null);
      continue;
    }

    const departure = resolveDateAndTime(baseIsoDate, stopTime.departure - offset);
    const arrival = resolveDateAndTime(baseIsoDate, stopTime.arrival - offset);

    calls.push({
      // Its own date, because GTFS counts past midnight and a time alone
      // cannot say which side of it a call falls on.
      date: departure.date,
      time: departure.time,
      arrivalDate: arrival.date,
      arrivalTime: arrival.time,
    });
  }

  return {
    originSeconds,
    trip: {
      tripId: cache.reverseTripMapping[flatTripId] ?? null,
      /*
       * The service day this run belongs to, which is the requested date for an
       * ordinary trip and the day before for one walked under the spillover
       * offset. A client cannot infer it: 00:10 looks like the start of a day
       * and is the end of the previous one.
       */
      serviceDate: offset === 0 ? baseIsoDate : shiftIsoDate(baseIsoDate, -1),
      /*
       * The trip's own sign wins over the pattern's, because a pattern's trips
       * do not always share one — HSL's rail H runs a single pattern whose
       * trips are signed both "Siuntio-Hanko" and "Siuntio".
       */
      headsign: getTripHeadsign(flatTripId) ?? route.headsign ?? null,
      calls,
    },
  };
}

/*
 * One variant's timetable for one service date.
 * GET /api/routes/:lineId/:patternId/timetable?date=YYYY-MM-DD
 *
 * A trip per row, a time per stop. The stop timetable answers "what calls at
 * this pole all day"; this answers "when does this line run, and how long does
 * it take between any two of its stops", which is the question a line page
 * exists for and which no board of a single stop can answer.
 *
 * Registered before the two-segment handler for legibility only — Express
 * matches segment counts exactly, so `/:lineId/:patternId` was never going to
 * swallow a three-segment path.
 */
router.get("/:lineId/:patternId/timetable", (req, res) => {
  try {
    const startedAt = performance.now();
    const resolved = resolvePattern(req, res);
    if (resolved === null) return;

    const { line, pattern } = resolved;
    const { date } = req.query;

    if (!date || !isValidDate(date)) {
      return res.status(400).json({
        errorCode: "BAD_DATE",
        error: "Missing or invalid date (YYYY-MM-DD).",
      });
    }

    const { route } = pattern;
    const today = servicesOn(date);
    const yesterday = servicesOn(shiftIsoDate(date, -1));

    const found = [];
    for (const [serviceKey, bucket] of Object.entries(
      route.service_buckets ?? {},
    )) {
      const serviceId = Number.parseInt(serviceKey, 10);

      /*
       * A service can qualify under both offsets and must then be walked twice.
       * A service running on consecutive days supplies this date's ordinary
       * trips (offset 0) and yesterday's small-hours spillover (offset a day);
       * treating them as exclusive drops every after-midnight trip of every
       * everyday service, which is most of them.
       */
      const offsets = [];
      if (today.has(serviceId)) offsets.push(0);
      if (yesterday.has(serviceId)) offsets.push(SECONDS_PER_DAY);
      if (offsets.length === 0) continue;

      // Defensive: the current parser always emits an object with `trip_ids`,
      // but the engine and the stops router both tolerate a bare array.
      const tripIds = Array.isArray(bucket) ? bucket : bucket?.trip_ids;
      if (!Array.isArray(tripIds)) continue;

      for (const offset of offsets) {
        for (const flatTripId of tripIds) {
          const described = describeTrip(route, flatTripId, date, offset);
          if (described !== null) found.push(described);
        }
      }
    }

    // Buckets are each sorted by origin departure, but several of them are
    // being merged here, so the whole list has to be put in order again.
    found.sort((a, b) => a.originSeconds - b.originSeconds);

    logCalculationTime(
      `Variant Timetable ${req.params.lineId}/${req.params.patternId} (${found.length} trips)`,
      startedAt,
    );
    res.json({
      ...describeLine(line),
      ...describeVariant(pattern),
      date,
      /*
       * Carried so the response stands on its own, and because `calls` is
       * indexed by a stop's true position in the pattern while this list can
       * have holes. `sequence` is the key that joins the two.
       */
      stops: route.stop_ids
        .map((internalStopId, index) =>
          describePatternStop(internalStopId, index, route),
        )
        .filter((stop) => stop !== null),
      stopCount: route.stop_ids.length,
      trips: found.map((entry) => entry.trip),
      totalTrips: found.length,
      /*
       * The date falls outside the feed's calendar altogether, which is a limit
       * of the data rather than a fact about this line — and worth different
       * words from "nothing runs that day".
       */
      outsideTimetableRange: cache.activeServices[toDateId(date)] === undefined,
      capabilities,
    });
  } catch (error) {
    console.error("[Line Timetable Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve line timetable.",
    });
  }
});

/*
 * One variant in full — its stop sequence and geometry.
 * GET /api/routes/:lineId/:patternId
 */
router.get("/:lineId/:patternId", (req, res) => {
  try {
    const startedAt = performance.now();
    const resolved = resolvePattern(req, res);
    if (resolved === null) return;

    const { line, pattern } = resolved;
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

    logCalculationTime(
      `Variant ${req.params.lineId}/${req.params.patternId}`,
      startedAt,
    );
    res.json({
      ...describeLine(line),
      ...describeVariant(pattern),
      stops: route.stop_ids
        .map((internalStopId, index) =>
          describePatternStop(internalStopId, index, route),
        )
        .filter((stop) => stop !== null),
      stopCount: route.stop_ids.length,
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

A variant's timetable for one service day. The date is required, and the days
worth asking for are the variant's own `serviceDates` rather than every date the
feed covers:
http://localhost:3000/api/routes/tram-4T/51/timetable?date=2026-09-10
*/
