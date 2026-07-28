const { raw } = require("express");
const convertSecondsToTimeOfDay = require("./convertSecondsToTimeOfDay");
const formatDuration = require("./formatDuration");
const calculateTotalDurationFromStartToEnd = require("./calculateTotalDurationFromStartToEnd");
const formatDistance = require("./formatDistance");

function formatItinerary(rawItinerary) {
  const itinerary = {
    startTime: null,
    endTime: null,
    totalDurationMinutes: null,
    legs: [],
  };
  const formattedStartTime = convertSecondsToTimeOfDay(
    rawItinerary.legs[0].startTime,
    "floor",
  );
  const formattedEndTime = convertSecondsToTimeOfDay(
    rawItinerary.targetArrivalTime,
    "ceil",
  );
  const totalItineraryDurationMinutes = calculateTotalDurationFromStartToEnd(
    formattedStartTime,
    formattedEndTime,
  );
  itinerary.startTime = formattedStartTime;
  itinerary.endTime = formattedEndTime;
  itinerary.totalDurationMinutes = totalItineraryDurationMinutes;

  rawItinerary.legs.forEach((leg) => {
    const legMode = leg["mode"];

    const formattedLegWaitDuration = formatDuration(leg.waitDurationSeconds);

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

    itinerary.legs.push({
      mode: legMode,
      waitDurationMinutes: formattedLegWaitDuration,
      startTime: formattedLegStartTime,
      fromStop: legFromStop,
      routeShortName: legRouteShortName,
      routeType: legRouteType,
      intermediateStops: legIntermediateStops,
      toStop: legToStop,
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
