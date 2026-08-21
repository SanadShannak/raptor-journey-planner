const express = require("express");
const router = express.Router();
const serverConfig = require("../serverConfig");

const { isValidDate } = require("../utils/inputValidator");
const {
  nowInNetwork,
  shiftIsoDate,
  toDateId,
  resolveDateAndTime,
} = require("../utils/networkTime");

/*
 * Everything is read from the shared RAM cache rather than require()d here.
 * These files are hundreds of megabytes; loading a second copy costs ~450 MB
 * of heap for data the process already holds.
 */
const {
  getCache,
  getCapabilities,
  getTripHeadsign,
} = require("../../memoryCache");

const cache = getCache();
const capabilities = getCapabilities();

const SECONDS_PER_DAY = 86400;

/**
 * Builds the public shape of a stop.
 *
 * Field names match `fromStop`/`toStop` on a journey leg so the frontend has
 * one stop type rather than two, with `id` added because a stop reached
 * directly can be linked to and planned from. The optional fields are only
 * attached when this network's feed supplied them — see `available` in
 * network-meta.
 */
function describeStop(internalStopId, fallbackGtfsId) {
  const stop = cache.stops[internalStopId];
  if (!stop) {
    return { id: fallbackGtfsId, name: null, code: null, lat: null, lon: null };
  }

  const described = {
    id: stop.gtfs_id,
    name: stop.name,
    code: stop.stop_code ?? null,
    lat: stop.lat,
    lon: stop.lon,
  };

  /*
   * Always present, null when this feed does not carry them. A missing key and
   * a null both mean "no value", but only one of them lets a consumer read the
   * field without guarding first.
   *
   * Accessibility is deliberately tri-state: GTFS 1 is accessible and 2 is not
   * accessible, but absent means nobody said. Collapsing "unknown" into false
   * would tell a wheelchair user a stop is unusable when the truth is that the
   * agency never published it.
   */
  described.description = stop.desc ?? null;
  described.fareZone = stop.zone ?? null;
  described.wheelchairAccessible =
    stop.wheelchair === undefined ? null : stop.wheelchair === 1;

  return described;
}

/**
 * Where a trip is heading, and how confidently we know.
 *
 * The trip's own destination sign is the truth when the feed carries one — a
 * pattern's trips do not always share it. Without headsigns the last stop of
 * the pattern is the honest approximation, which is why the field is called
 * `destination` rather than `headsign`.
 *
 * A trip that ends at the stop being viewed has no onward destination at all;
 * saying "towards <this stop>" would be nonsense, so that case is flagged.
 */
function describeDestination(route, flatTripId, stopIndex) {
  const terminatesHere = stopIndex === route.stop_ids.length - 1;
  if (terminatesHere) {
    return { destination: null, terminatesHere: true };
  }

  const headsign = getTripHeadsign(flatTripId) ?? route.headsign ?? null;
  if (headsign !== null) {
    return { destination: headsign, terminatesHere: false };
  }

  const lastStop = cache.stops[route.stop_ids[route.stop_ids.length - 1]];
  return { destination: lastStop?.name ?? null, terminatesHere: false };
}

/** Identifies a line, including mode — designations collide across modes. */
function lineIdFor(route) {
  return `${route.route_type}-${route.short_name}`;
}

/** The services running on a given date, as a Set for cheap membership tests. */
function servicesOn(isoDate) {
  return new Set(cache.activeServices[toDateId(isoDate)] ?? []);
}

/**
 * Walks every trip calling at a stop on a given service date.
 *
 * Yesterday's services are always considered: a trip that departs at 25:10 on
 * yesterday's service is the 01:10 departure of the requested date, and
 * omitting it would leave a hole in the small hours of every board.
 *
 * @param {number} internalStopId
 * @param {string} isoDate Service date being asked about.
 * @param {(visit: object) => void} visit Called per departure.
 */
function forEachDeparture(internalStopId, isoDate, visit) {
  const servingRoutes = cache.stopToRoutes[internalStopId] ?? [];
  const today = servicesOn(isoDate);
  const yesterday = servicesOn(shiftIsoDate(isoDate, -1));

  for (const routeId of servingRoutes) {
    const route = cache.routes[routeId];
    if (!route?.stop_ids) continue;

    /*
     * `indexOf` rather than `stop_order_map`: the map keeps only the last
     * position when a pattern calls at a stop twice, which a loop route does.
     */
    const stopIndex = route.stop_ids.indexOf(internalStopId);
    if (stopIndex === -1) continue;

    for (const [serviceKey, bucket] of Object.entries(
      route.service_buckets ?? {},
    )) {
      const serviceId = Number.parseInt(serviceKey, 10);

      /*
       * Offsets convert a trip's own clock onto the requested date's clock.
       *
       * A service can qualify under both, and then it must be walked twice.
       * GTFS counts past midnight, so a service running every day supplies
       * both today's ordinary trips (offset 0) and yesterday's small-hours
       * spillover — the 25:10 trip that is really this date's 01:10. Treating
       * these as mutually exclusive silently drops every after-midnight
       * departure for any service that runs on consecutive days, which is
       * most of them.
       */
      const offsets = [];
      if (today.has(serviceId)) offsets.push(0);
      if (yesterday.has(serviceId)) offsets.push(SECONDS_PER_DAY);
      if (offsets.length === 0) continue;

      const tripIds = Array.isArray(bucket) ? bucket : bucket?.trip_ids;
      if (!Array.isArray(tripIds)) continue;

      for (const offset of offsets) {
        for (const flatTripId of tripIds) {
          const stopTimes = cache.timetables[flatTripId];
          const stopTime = stopTimes?.[stopIndex];
          if (!stopTime) continue;

          visit({
            route,
            routeId,
            flatTripId,
            stopIndex,
            departureSeconds: stopTime.departure - offset,
            arrivalSeconds: stopTime.arrival - offset,
          });
        }
      }
    }
  }
}

/** Turns an internal visit into the public departure shape. */
function describeDeparture(visit, baseIsoDate) {
  const { route, flatTripId, stopIndex, departureSeconds, arrivalSeconds } =
    visit;

  const departure = resolveDateAndTime(baseIsoDate, departureSeconds);
  const arrival = resolveDateAndTime(baseIsoDate, arrivalSeconds);
  const { destination, terminatesHere } = describeDestination(
    route,
    flatTripId,
    stopIndex,
  );

  const described = {
    // Its own date, so an after-midnight departure is never mistaken for this
    // morning's. Times alone wrap at 24:00 and lose the distinction.
    date: departure.date,
    time: departure.time,
    arrivalDate: arrival.date,
    arrivalTime: arrival.time,
    lineId: lineIdFor(route),
    routeShortName: route.short_name,
    routeType: route.route_type,
    destination,
    terminatesHere,
    tripId: cache.reverseTripMapping[flatTripId] ?? null,
  };

  described.directionId = route.direction_id ?? null;
  described.routeLongName = route.long_name ?? null;

  return described;
}

/** The distinct lines calling at a stop, with where each one goes. */
function describeServingLines(internalStopId) {
  const byLine = new Map();

  for (const routeId of cache.stopToRoutes[internalStopId] ?? []) {
    const route = cache.routes[routeId];
    if (!route?.stop_ids) continue;

    const stopIndex = route.stop_ids.indexOf(internalStopId);
    if (stopIndex === -1) continue;

    // Keyed by mode as well as designation: "H" is both a tram and a train.
    const lineId = lineIdFor(route);
    if (!byLine.has(lineId)) {
      byLine.set(lineId, {
        lineId,
        routeShortName: route.short_name,
        routeType: route.route_type,
        routeLongName: route.long_name ?? null,
        directionId: route.direction_id ?? null,
        destinations: [],
      });
    }

    const { destination, terminatesHere } = describeDestination(
      route,
      route.service_buckets?.[Object.keys(route.service_buckets)[0]]
        ?.trip_ids?.[0],
      stopIndex,
    );
    const line = byLine.get(lineId);
    if (
      !terminatesHere &&
      destination !== null &&
      !line.destinations.includes(destination)
    ) {
      line.destinations.push(destination);
    }
  }

  return [...byLine.values()].sort((a, b) =>
    a.routeShortName.localeCompare(b.routeShortName, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function resolveStop(gtfsId, res) {
  const internalStopId = cache.stopMapping[gtfsId];
  if (internalStopId === undefined) {
    res
      .status(404)
      .json({ errorCode: "STOP_NOT_FOUND", error: "Stop ID not found." });
    return null;
  }
  return internalStopId;
}

/*
 * Full timetable for one service date.
 * GET /api/stop/:id/timetable?date=YYYY-MM-DD
 */
router.get("/:id/timetable", (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const internalStopId = resolveStop(id, res);
    if (internalStopId === null) return;

    if (!date || !isValidDate(date)) {
      return res.status(400).json({
        errorCode: "BAD_DATE",
        error: "Missing or invalid date (YYYY-MM-DD).",
      });
    }

    const departures = [];
    forEachDeparture(internalStopId, date, (visit) => {
      // Only what actually falls on the requested date; a trip running past
      // midnight belongs to the following day's board, where it will appear
      // through that day's yesterday-offset pass.
      if (visit.departureSeconds < 0 || visit.departureSeconds >= SECONDS_PER_DAY) {
        return;
      }
      departures.push(visit);
    });

    departures.sort((a, b) => a.departureSeconds - b.departureSeconds);

    // Grouped as an array, not an object: object keys reorder "07" after "23"
    // because integer-like keys are hoisted, which silently scrambles a board.
    const byHour = new Map();
    for (const visit of departures) {
      const hour = String(Math.floor(visit.departureSeconds / 3600)).padStart(
        2,
        "0",
      );
      if (!byHour.has(hour)) byHour.set(hour, []);
      byHour.get(hour).push(describeDeparture(visit, date));
    }

    res.json({
      stop: describeStop(internalStopId, id),
      date,
      servingLines: describeServingLines(internalStopId),
      schedule: [...byHour.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([hour, hourDepartures]) => ({
          hour,
          departures: hourDepartures,
        })),
      totalDepartures: departures.length,
      // Empty is a legitimate answer — a date outside the feed's calendar has
      // no services rather than being an error.
      outsideTimetableRange:
        cache.activeServices[toDateId(date)] === undefined,
      capabilities,
    });
  } catch (error) {
    console.error("[Timetable Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve timetable.",
    });
  }
});

/*
 * Live departure board — what leaves next, from now.
 * GET /api/stop/:id?limit=n
 */
router.get("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.max(
      1,
      Math.min(
        200,
        Number.parseInt(req.query.limit, 10) ||
          serverConfig.DEFAULT_DEPARTURES_LIMIT,
      ),
    );

    const internalStopId = resolveStop(id, res);
    if (internalStopId === null) return;

    // "Now" is the network's clock, never the host's.
    const now = nowInNetwork();

    const upcoming = [];
    forEachDeparture(internalStopId, now.date, (visit) => {
      /*
       * Anything already gone is not upcoming. This also disposes of
       * yesterday's spillover once it has passed: those resolve to small
       * positive seconds early in the morning and to negatives later, both of
       * which fall out here without a separate cutoff.
       */
      if (visit.departureSeconds < now.seconds) return;
      upcoming.push(visit);
    });

    upcoming.sort((a, b) => a.departureSeconds - b.departureSeconds);

    res.json({
      stop: describeStop(internalStopId, id),
      // The moment the board was resolved, so a stale tab is detectable.
      asOf: { date: now.date, time: resolveDateAndTime(now.date, now.seconds).time },
      servingLines: describeServingLines(internalStopId),
      departures: upcoming
        .slice(0, limit)
        .map((visit) => describeDeparture(visit, now.date)),
      capabilities,
    });
  } catch (error) {
    console.error("[Departures Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve upcoming departures.",
    });
  }
});

module.exports = router;

/* example usages:
http://localhost:3000/api/stop/2611502
http://localhost:3000/api/stop/2611502/timetable?date=2026-09-10
*/
