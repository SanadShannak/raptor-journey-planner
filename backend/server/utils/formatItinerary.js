const convertSecondsToTimeOfDay = require("./convertSecondsToTimeOfDay");
const roundSecondsToMinute = require("./roundSecondsToMinute");
const formatDuration = require("./formatDuration");
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
 *
 * ---------------------------------------------------------------------------
 * Every duration below is measured between the rounded times this same
 * function publishes, and never from the engine's raw seconds.
 *
 * The engine is exact and works in seconds. Rounding to the minute happens
 * here, and it is deliberately asymmetric: an arrival rounds up and a
 * departure rounds down, so nobody is told they arrive earlier or may leave
 * later than they really can. Round a duration separately from those same raw
 * seconds and the two answers drift apart — the asymmetry closes a gap between
 * legs by up to two minutes and opens a leg by the same. That is how a
 * response came to say "wait 4 minutes" between 01:50 and 01:52, and "ride 9
 * minutes" between times ten minutes apart.
 *
 * Measuring between the published times settles it in the safe direction: a
 * leg reads no shorter, and a connection no longer, than it truly is. It also
 * makes the response add up — the legs and the waits between them now tile the
 * journey exactly, which separately rounded figures cannot promise.
 *
 * `totalDurationMinutes` was always computed this way. The rule is simply
 * applied to every duration now rather than to one of them.
 * ---------------------------------------------------------------------------
 */

const SECONDS_IN_DAY = 86400;

/**
 * Keeps a published date on the same day as the published time beside it.
 *
 * The engine dates a moment from its exact second, and rounding here can move
 * that moment across midnight: an arrival at 23:59:20 is published as "00:00"
 * while its date still reads the day before. The clock and the calendar then
 * disagree about which day the traveller gets there, which is the one thing a
 * twelve-hour display cannot survive — "12:00 AM" on the wrong date is a
 * whole day out.
 *
 * Only a ceiling can do this, and only ever by one day; a floor never leaves
 * the day it started in. The shift is computed rather than assumed so that
 * both directions are covered whatever the rounding does later.
 */
function shiftDate(isoDate, days) {
  if (days === 0 || typeof isoDate !== "string") return isoDate;

  const [year, month, day] = isoDate.split("-").map(Number);
  // Built from parts and in UTC: this only ever counts whole days, and a local
  // Date would fold an hour of daylight saving into that count.
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** How many days the rounding moved a moment: 0, or 1 across midnight. */
function daysCrossed(rawSeconds, roundedSeconds) {
  return (
    Math.floor(roundedSeconds / SECONDS_IN_DAY) -
    Math.floor(rawSeconds / SECONDS_IN_DAY)
  );
}

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
  /*
   * Rounded once, then used for both the string and the arithmetic. The
   * engine's seconds already carry the day offset, so the difference between
   * two rounded values is the number of minutes between them even when the
   * journey crosses midnight — no date handling required.
   */
  const itineraryStartSeconds = roundSecondsToMinute(
    rawItinerary.legs[0].startTime,
    "floor",
  );
  const formattedStartTime = convertSecondsToTimeOfDay(
    itineraryStartSeconds,
    "floor",
  );
  const itineraryEndSeconds = roundSecondsToMinute(
    rawItinerary.targetArrivalTime,
    "ceil",
  );
  const itineraryEndDate = shiftDate(
    rawItinerary.legs[rawItinerary.legs.length - 1].endDate,
    daysCrossed(rawItinerary.targetArrivalTime, itineraryEndSeconds),
  );
  const formattedEndTime = convertSecondsToTimeOfDay(
    itineraryEndSeconds,
    "ceil",
  );
  const totalItineraryDurationMinutes = formatDuration(
    itineraryEndSeconds - itineraryStartSeconds,
  );
  itinerary.startDate = itineraryStartDate;
  itinerary.startTime = formattedStartTime;
  itinerary.endDate = itineraryEndDate;
  itinerary.endTime = formattedEndTime;
  itinerary.totalDurationMinutes = totalItineraryDurationMinutes;

  /* The previous leg's published arrival, which is where a wait is measured
     from. Null before the first leg, which nobody waits for. */
  let previousLegEndSeconds = null;

  rawItinerary.legs.forEach((leg) => {
    const legMode = leg["mode"];

    const legStartSeconds = roundSecondsToMinute(leg.startTime, "floor");
    const legEndSeconds = roundSecondsToMinute(leg.endTime, "ceil");

    /*
     * Never negative. The rounding can in principle push an arrival past the
     * departure it connects to — a sub-minute transfer — and a response that
     * says a traveller waits for less than no time would be worse than one
     * that says the connection is immediate, which at this resolution it is.
     */
    const legWaitSeconds =
      previousLegEndSeconds === null
        ? 0
        : Math.max(0, legStartSeconds - previousLegEndSeconds);
    const formattedLegWaitDuration = formatDuration(legWaitSeconds);

    const legStartDate = shiftDate(
      leg["startDate"],
      daysCrossed(leg.startTime, legStartSeconds),
    );

    const formattedLegStartTime = convertSecondsToTimeOfDay(
      legStartSeconds,
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

    const legEndDate = shiftDate(
      leg["endDate"],
      daysCrossed(leg.endTime, legEndSeconds),
    );

    const formattedLegEndTime = convertSecondsToTimeOfDay(legEndSeconds, "ceil");

    const legTripId = leg["tripId"];

    /*
     * One measurement for the leg, reported under whichever key its mode owns.
     * Which key that is still comes from the engine's own fields, so a leg
     * keeps exactly the null shape it had before: a walking leg carries no
     * transit duration and a ridden one carries no walking duration.
     */
    const legDurationMinutes = formatDuration(legEndSeconds - legStartSeconds);

    const formattedLegTransitDurationMinutes =
      leg.transitDurationSeconds !== null &&
      leg.transitDurationSeconds !== undefined
        ? legDurationMinutes
        : null;

    const formattedLegTransitDistanceMeters =
      leg["transitDistanceMeters"] !== null
        ? formatDistance(leg["transitDistanceMeters"])
        : null;

    const formattedLegWalkDurationMinutes =
      leg.walkDurationSeconds !== null && leg.walkDurationSeconds !== undefined
        ? legDurationMinutes
        : null;

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

    previousLegEndSeconds = legEndSeconds;
  });
  return itinerary;
}

module.exports = formatItinerary;
