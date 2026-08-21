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
 * Where a transit leg's vehicle is heading, in two forms.
 *
 * `headsign` is the operator's own destination sign, verbatim, or null when
 * the feed carries none for this trip. `destination` always has a value: the
 * headsign when there is one, the pattern's last stop otherwise.
 *
 * Both exist because they license different wording. A real headsign is what
 * is displayed on the front of the vehicle, so a UI can print it as-is and a
 * rider can match it. A terminus fallback is our inference — the vehicle may
 * well be signed something else — so it should read "towards X", not be
 * presented as the sign itself.
 *
 * The trip's own sign is preferred over the pattern's, because a pattern's
 * trips do not always share one: HSL's rail H runs one Helsinki-Siuntio
 * pattern where some trips are signed "Siuntio-Hanko" and others "Siuntio".
 */
function resolveDestination(route, internalTripId, cache) {
  if (!route) return { headsign: null, destination: null };

  const headsign =
    (internalTripId !== null && internalTripId !== undefined
      ? getTripHeadsign(internalTripId)
      : null) ??
    route.headsign ??
    null;
  if (headsign !== null) return { headsign, destination: headsign };

  const lastStop = cache.stops[route.stop_ids[route.stop_ids.length - 1]];
  return { headsign: null, destination: lastStop?.name ?? null };
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
    const { headsign, destination } = resolveDestination(
      route,
      internalTripId,
      cache,
    );

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
      headsign,
      destination,
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
