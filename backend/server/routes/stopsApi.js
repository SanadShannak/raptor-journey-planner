const express = require("express");
const router = express.Router();
const serverConfig = require("../serverConfig");

const { isValidDate, isValidTime } = require("../utils/inputValidator");
const convertSecondsToTimeOfDay = require("../utils/convertSecondsToTimeOfDay");
const convertTimeOfDayToSeconds = require("../utils/convertTimeOfDayToSeconds");

const activeNetwork = serverConfig.ACTIVE_NETWORK;
const localTimezone = serverConfig.NETWORK_TIMEZONES[activeNetwork] || "UTC";

const activeServices = require(
  `../../../processed-data/${activeNetwork}-processed-data/active-services.processed.json`,
);
const stopMapping = require(
  `../../../processed-data/${activeNetwork}-processed-data/stop-mapping.json`,
);
const stops = require(
  `../../../processed-data/${activeNetwork}-processed-data/stops.processed.json`,
);
const stopToRoutes = require(
  `../../../processed-data/${activeNetwork}-processed-data/stop-to-routes.json`,
);
const routes = require(
  `../../../processed-data/${activeNetwork}-processed-data/routes.processed.json`,
);
const timetables = require(
  `../../../processed-data/${activeNetwork}-processed-data/timetables.processed.json`,
);

router.get("/:id/timetable", (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const internalStopId = stopMapping[id];
    if (internalStopId === undefined) {
      return res
        .status(404)
        .json({ errorCode: "STOP_NOT_FOUND", error: "Stop ID not found." });
    }
    if (!date || !isValidDate(date)) {
      return res
        .status(400)
        .json({ error: "Missing or invalid date (YYYY-MM-DD)" });
    }

    const stopMeta = stops[internalStopId] || {};
    const stopDetails = {
      gtfs_id: stopMeta.gtfs_id || id,
      stop_code: stopMeta.stop_code || null,
      name: stopMeta.name || "Unknown Stop",
    };

    const activeRoutes = stopToRoutes[internalStopId] || [];
    const dateId = date.replace(/-/g, "");

    const queryDate = new Date(date);
    queryDate.setDate(queryDate.getDate() - 1);
    const y = queryDate.getFullYear();
    const m = String(queryDate.getMonth() + 1).padStart(2, "0");
    const d = String(queryDate.getDate()).padStart(2, "0");
    const yesterdayId = `${y}${m}${d}`;

    const servicesToday = activeServices[dateId] || [];
    const servicesYesterday = activeServices[yesterdayId] || [];
    const rawResults = [];
    const routesMap = new Map();

    for (const rId of activeRoutes) {
      const route = routes[rId];
      if (!route || !route.stop_ids) continue;

      const stopIndex = route.stop_ids.indexOf(internalStopId);
      if (stopIndex === -1) continue;

      const routeName = route.short_name || "Transit";
      const routeType = route.route_type;

      if (!routesMap.has(routeName)) {
        routesMap.set(routeName, { routeShortName: routeName, routeType });
      }

      for (const [serviceIdStr, bucketData] of Object.entries(
        route.service_buckets || {},
      )) {
        const serviceInt = parseInt(serviceIdStr, 10);
        let activeOffset = null;

        if (servicesToday.includes(serviceInt)) {
          activeOffset = 0;
        } else if (servicesYesterday.includes(serviceInt)) {
          activeOffset = 86400;
        }

        if (activeOffset !== null) {
          const tripArray = Array.isArray(bucketData)
            ? bucketData
            : bucketData.trip_ids;
          if (!Array.isArray(tripArray)) continue;

          for (const tripId of tripArray) {
            const tripStopTimes = timetables[tripId];
            if (!tripStopTimes || !tripStopTimes[stopIndex]) continue;

            const rawDeparture = tripStopTimes[stopIndex].departure;
            const rawArrival = tripStopTimes[stopIndex].arrival;
            const normalizedDeparture = rawDeparture - activeOffset;
            const normalizedArrival = rawArrival - activeOffset;

            if (normalizedDeparture >= 0 && normalizedDeparture < 86400) {
              rawResults.push({
                routeId: rId,
                routeShortName: routeName,
                routeType: routeType,
                tripId: tripId,
                formattedDeparture:
                  convertSecondsToTimeOfDay(normalizedDeparture),
                formattedArrival: convertSecondsToTimeOfDay(normalizedArrival),
                departureSeconds: normalizedDeparture,
              });
            }
          }
        }
      }
    }

    rawResults.sort((a, b) => a.departureSeconds - b.departureSeconds);

    const scheduleByHour = {};
    for (const trip of rawResults) {
      const hourStr = String(Math.floor(trip.departureSeconds / 3600)).padStart(
        2,
        "0",
      );
      const minStr = String(
        Math.floor((trip.departureSeconds % 3600) / 60),
      ).padStart(2, "0");

      if (!scheduleByHour[hourStr]) {
        scheduleByHour[hourStr] = [];
      }

      scheduleByHour[hourStr].push({
        minute: minStr,
        route: trip.routeShortName,
        routeType: trip.routeType,
        formattedDeparture: trip.formattedDeparture,
        formattedArrival: trip.formattedArrival,
      });
    }

    const sortedScheduleArray = Object.keys(scheduleByHour)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((hour) => ({
        hour: hour,
        departures: scheduleByHour[hour],
      }));

    const availableRoutes = Array.from(routesMap.values()).sort((a, b) => {
      return a.routeShortName.localeCompare(b.routeShortName, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    res.json({
      stop: stopDetails,
      availableRoutes,
      schedule: sortedScheduleArray,
    });
  } catch (error) {
    console.error("[Timetable Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve timetable.",
    });
  }
});

router.get("/:id/", (req, res) => {
  try {
    const { id } = req.params;
    const { limit = serverConfig.DEFAULT_DEPARTURES_LIMIT } = req.query;

    const internalStopId = stopMapping[id];
    if (internalStopId === undefined)
      return res
        .status(404)
        .json({ errorCode: "STOP_NOT_FOUND", error: "Stop ID not found." });

    const stopMeta = stops[internalStopId] || {};
    const stopDetails = {
      gtfs_id: stopMeta.gtfs_id || id,
      stop_code: stopMeta.stop_code || null,
      name: stopMeta.name || "Unknown Stop",
    };

    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: localTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const tzDate = {};
    parts.forEach((p) => (tzDate[p.type] = p.value));

    const currentDate = `${tzDate.year}-${tzDate.month}-${tzDate.day}`;
    const currentTime = `${tzDate.hour === "24" ? "00" : tzDate.hour}:${tzDate.minute}:${tzDate.second}`;

    const currentSeconds = convertTimeOfDayToSeconds(currentTime);
    const dateId = currentDate.replace(/-/g, "");

    let isLateNightQuery = false;
    let yesterdayId = null;

    if (currentSeconds >= 0 && currentSeconds <= 14400) {
      isLateNightQuery = true;
      const yesterday = new Date(
        now.toLocaleString("en-US", { timeZone: localTimezone }),
      );
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, "0");
      const d = String(yesterday.getDate()).padStart(2, "0");
      yesterdayId = `${y}${m}${d}`;
    }

    const activeRoutes = stopToRoutes[internalStopId] || [];
    const servicesToday = activeServices[dateId] || [];
    const servicesYesterday = yesterdayId
      ? activeServices[yesterdayId] || []
      : [];
    const results = [];

    for (const rId of activeRoutes) {
      const route = routes[rId];
      if (!route || !route.stop_ids) continue;

      const stopIndex = route.stop_ids.indexOf(internalStopId);
      if (stopIndex === -1) continue;

      for (const [serviceIdStr, bucketData] of Object.entries(
        route.service_buckets || {},
      )) {
        const serviceInt = parseInt(serviceIdStr, 10);
        let activeOffset = null;

        if (servicesToday.includes(serviceInt)) {
          activeOffset = 0;
        } else if (isLateNightQuery && servicesYesterday.includes(serviceInt)) {
          activeOffset = 86400;
        }

        if (activeOffset !== null) {
          const tripArray = Array.isArray(bucketData)
            ? bucketData
            : bucketData.trip_ids;

          for (const tripId of tripArray) {
            const tripStopTimes = timetables[tripId];
            if (!tripStopTimes || !tripStopTimes[stopIndex]) continue;

            const rawDeparture = tripStopTimes[stopIndex].departure;
            const rawArrival = tripStopTimes[stopIndex].arrival;
            const targetTime = currentSeconds + activeOffset;

            if (rawDeparture < targetTime) continue;

            results.push({
              routeShortName: route.short_name,
              routeType: route.route_type,
              formattedDeparture: convertSecondsToTimeOfDay(
                rawDeparture,
                "floor",
              ),
              departureSeconds: rawDeparture,
              formattedArrival: convertSecondsToTimeOfDay(rawArrival, "ceil"),
              arrivalSeconds: rawArrival,
            });
          }
        }
      }
    }

    results.sort((a, b) => a.departureSeconds - b.departureSeconds);
    res.json({
      stop: stopDetails,
      departures: results.slice(0, parseInt(limit, 10)),
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
http://localhost:3000/api/stop/2611502/
http://localhost:3000/api/stop/2611502/timetable?date=2026-09-10
*/
