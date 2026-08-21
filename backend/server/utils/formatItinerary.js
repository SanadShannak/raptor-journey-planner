const convertSecondsToTimeOfDay = require("./convertSecondsToTimeOfDay");
const formatDuration = require("./formatDuration");
const calculateTotalDurationFromStartToEnd = require("./calculateTotalDurationFromStartToEnd");
const formatDistance = require("./formatDistance");
const { getCache, getTripHeadsign } = require("../../memoryCache");
const { lineIdFor } = require("./lineIdentity");

/*
 * Presenter for a raw itinerary: seconds become clock strings, distances get
 * rounded, and the internal handles the engine hands over are resolved into
 * the fields a client can actually use.
 *
 * Everything resolved here is optional in GTFS. A feed without headsigns,
 * directions, or long names produces the same leg shape with nulls in those
 * places — never a missing key, so a consumer can read every field
 * unconditionally and decide what to render.
 */

/**
 * Where a transit leg's vehicle is ultimately heading.
 *
 * The trip's own destination sign is preferred, because a pattern's trips do
 * not always share one. Without headsigns in the feed, the pattern's last stop
 * is the honest approximation — which is why this is called `destination`
 * rather than `headsign`.
 */
function resolveDestination(route, internalTripId, cache) {
  if (!route) return null;

  const headsign =
    (internalTripId !== null && internalTripId !== undefined
      ? getTripHeadsign(internalTripId)
      : null) ??
    route.headsign ??
    null;
  if (headsign !== null) return headsign;

  const lastStop = cache.stops[route.stop_ids[route.stop_ids.length - 1]];
  return lastStop?.name ?? null;
}

function formatItinerary(rawItinerary) {
  const cache = getCache();

  const itinerary = {
    startDate: null,
    startTime: null,
    endDate: null,
    endTime: null,
    totalDurationMinutes: null,
    legs: [],
  };

  const itineraryStartDate = rawItinerary.legs[0].startDate;
  const formattedStartTime = convertSecondsToTimeOfDay(
    rawItinerary.legs[0].startTime,
    "floor",
  );
  const itineraryEndDate =
    rawItinerary.legs[rawItinerary.legs.length - 1].endDate;

  const formattedEndTime = convertSecondsToTimeOfDay(
    rawItinerary.targetArrivalTime,
    "ceil",
  );
  const totalItineraryDurationMinutes = calculateTotalDurationFromStartToEnd(
    formattedStartTime,
    formattedEndTime,
  );
  itinerary.startDate = itineraryStartDate;
  itinerary.startTime = formattedStartTime;
  itinerary.endDate = itineraryEndDate;
  itinerary.endTime = formattedEndTime;
  itinerary.totalDurationMinutes = totalItineraryDurationMinutes;

  rawItinerary.legs.forEach((leg) => {
    const legMode = leg["mode"];

    const formattedLegWaitDuration = formatDuration(leg.waitDurationSeconds);

    const legStartDate = leg["startDate"];

    const formattedLegStartTime = convertSecondsToTimeOfDay(
      leg.startTime,
      "floor",
    );
    const legFromStop = leg["fromStop"];

    const legRouteShortName = leg["routeShortName"];

    const legRouteType = leg["routeType"];

    const legIntermediateStops = leg["intermediateStops"];
    if (legIntermediateStops !== null) {
      legIntermediateStops.forEach((stop, stopIndex) => {
        const intermediateStopFormattedArrivalTime = convertSecondsToTimeOfDay(
          stop["stopArrivalTimeSeconds"],
          "ceil",
        );
        legIntermediateStops[stopIndex]["stopArrivalTimeSeconds"] =
          intermediateStopFormattedArrivalTime;
        stop["stopArrivalTime"] = stop["stopArrivalTimeSeconds"];
        delete stop["stopArrivalTimeSeconds"];
      });
    }

    const legToStop = leg["toStop"];

    const legEndDate = leg["endDate"];

    const formattedLegEndTime = convertSecondsToTimeOfDay(leg.endTime, "ceil");

    const legTripId = leg["tripId"];

    const formattedLegTransitDurationMinutes = formatDuration(
      leg.transitDurationSeconds,
    );

    const formattedLegTransitDistanceMeters =
      leg["transitDistanceMeters"] !== null
        ? formatDistance(leg["transitDistanceMeters"])
        : null;

    const formattedLegWalkDurationMinutes = formatDuration(
      leg.walkDurationSeconds,
    );

    const formattedWalkDistanceMeters =
      leg["walkDistanceMeters"] !== null
        ? formatDistance(leg["walkDistanceMeters"])
        : null;

    const legShape = leg.shape;

    /*
     * The engine's internal handles are resolved here and go no further. Every
     * derived field is null on a walking leg and on any feed that lacks the
     * source column, so the key set is identical for every leg.
     */
    const internalRouteId = leg["internalRouteId"] ?? null;
    const internalTripId = leg["internalTripId"] ?? null;
    const route =
      internalRouteId !== null ? cache.routes[internalRouteId] : null;

    itinerary.legs.push({
      mode: legMode,
      waitDurationMinutes: formattedLegWaitDuration,
      startDate: legStartDate,
      startTime: formattedLegStartTime,
      fromStop: legFromStop,
      routeShortName: legRouteShortName,
      routeType: legRouteType,
      lineId: lineIdFor(route),
      routeLongName: route?.long_name ?? null,
      directionId: route?.direction_id ?? null,
      destination:
        route !== null ? resolveDestination(route, internalTripId, cache) : null,
      intermediateStops: legIntermediateStops,
      toStop: legToStop,
      endDate: legEndDate,
      endTime: formattedLegEndTime,
      tripId: legTripId,
      transitDurationMinutes: formattedLegTransitDurationMinutes,
      transitDistanceMeters: formattedLegTransitDistanceMeters,
      walkDurationMinutes: formattedLegWalkDurationMinutes,
      walkDistanceMeters: formattedWalkDistanceMeters,
      shape: legShape,
    });
  });
  return itinerary;
}

module.exports = formatItinerary;
