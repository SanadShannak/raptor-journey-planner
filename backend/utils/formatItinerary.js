const { raw } = require("express");
const convertSecondsToTimeOfDay = require("./convertSecondsToTimeOfDay");
const formatDuration = require("./formatDuration");
const calculateTotalDurationFromStartToEnd = require("./calculateTotalDurationFromStartToEnd");
const formatDistance = require("./formatDistance");

function formatItinerary(rawItinerary) {
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

    itinerary.legs.push({
      mode: legMode,
      waitDurationMinutes: formattedLegWaitDuration,
      startDate: legStartDate,
      startTime: formattedLegStartTime,
      fromStop: legFromStop,
      routeShortName: legRouteShortName,
      routeType: legRouteType,
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
