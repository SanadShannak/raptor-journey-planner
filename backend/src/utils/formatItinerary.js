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
 * Measuring between the published times makes the response add up — the legs
 * and the waits between them tile the journey exactly — but only if the times
 * themselves are consistent, and rounding each one on its own does not make
 * them so. Getting off a bus at 09:47:30 and starting to walk is *one* moment,
 * yet as an arrival it rounded up to 09:48 and as a departure down to 09:47:
 * the walk began before the bus arrived, and the legs added up to a minute more
 * than the journey. A feed whose times all fall on the minute never shows it;
 * Amman's, interpolated to the second, did on most journeys.
 *
 * So the times are labelled together, by {@link labelMoments}, and every label
 * published satisfies four rules:
 *
 * 1. It is the moment's own minute, rounded down or up — never further.
 * 2. The labels never run backwards along the journey, so no wait is negative
 *    and no leg overlaps the next; and one moment gets one label.
 * 3. A vehicle's departure is always rounded down: nobody is told they may
 *    leave later than the vehicle does.
 * 4. Everything else keeps its natural rounding — an arrival up — unless rule
 *    2 cannot hold otherwise, which happens only when a fixed departure falls
 *    in the same minute.
 *
 * Every duration is then a difference of published labels.
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

/**
 * The published minute of every moment in the journey, in order: each leg's
 * start, then its end, as seconds on the minute. See the rules at the top.
 *
 * Each moment first takes its natural rounding: a vehicle departure down, an
 * arrival up, a walk that begins the moment a previous leg ends up with that
 * arrival — it is the same moment — and a walk from the origin down, as
 * "leave by". Then, walking back from the end, any label later than the one
 * after it is brought down to it.
 *
 * That last step is what makes it correct rather than merely tidy. It can only
 * lower a label as far as its own moment's floor: the moments run forwards in
 * true time, so the next label is never below the next floor, and that is
 * never below this one's. A vehicle departure is already at its floor and so
 * is never moved, and a moment shared by two legs gets one label, because two
 * equal times cannot be pulled apart by taking a minimum.
 */
function labelMoments(legs) {
  const moments = [];
  legs.forEach((leg, index) => {
    const previous = legs[index - 1];
    const continuesPrevious =
      previous !== undefined && previous.endTime === leg.startTime;
    const startRounding =
      leg.mode !== "WALK" ? "floor" : continuesPrevious ? "ceil" : "floor";

    moments.push(roundSecondsToMinute(leg.startTime, startRounding));
    moments.push(roundSecondsToMinute(leg.endTime, "ceil"));
  });

  for (let i = moments.length - 2; i >= 0; i--) {
    moments[i] = Math.min(moments[i], moments[i + 1]);
  }
  return moments;
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

  /*
   * Labelled once, then used for both the strings and the arithmetic. The
   * engine's seconds already carry the day offset, so the difference between
   * two labels is the number of minutes between them even when the journey
   * crosses midnight — no date handling required.
   *
   * The journey starts and ends where its first and last legs do: measured
   * from anything else, the legs could not tile it.
   */
  const moments = labelMoments(rawItinerary.legs);
  const firstLeg = rawItinerary.legs[0];
  const lastLeg = rawItinerary.legs[rawItinerary.legs.length - 1];

  const itineraryStartSeconds = moments[0];
  const itineraryStartDate = shiftDate(
    firstLeg.startDate,
    daysCrossed(firstLeg.startTime, itineraryStartSeconds),
  );
  const formattedStartTime = convertSecondsToTimeOfDay(itineraryStartSeconds);
  const itineraryEndSeconds = moments[moments.length - 1];
  const itineraryEndDate = shiftDate(
    lastLeg.endDate,
    daysCrossed(lastLeg.endTime, itineraryEndSeconds),
  );
  const formattedEndTime = convertSecondsToTimeOfDay(itineraryEndSeconds);
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

  rawItinerary.legs.forEach((leg, legIndex) => {
    const legMode = leg["mode"];

    const legStartSeconds = moments[2 * legIndex];
    const legEndSeconds = moments[2 * legIndex + 1];

    // Never negative, because the labels never run backwards.
    const legWaitSeconds =
      previousLegEndSeconds === null
        ? 0
        : legStartSeconds - previousLegEndSeconds;
    const formattedLegWaitDuration = formatDuration(legWaitSeconds);

    const legStartDate = shiftDate(
      leg["startDate"],
      daysCrossed(leg.startTime, legStartSeconds),
    );

    const formattedLegStartTime = convertSecondsToTimeOfDay(legStartSeconds);
    const legFromStop = leg["fromStop"];

    const legRouteShortName = leg["routeShortName"];

    const legRouteType = leg["routeType"];

    const legIntermediateStops = leg["intermediateStops"];
    if (legIntermediateStops !== null) {
      legIntermediateStops.forEach((stop, stopIndex) => {
        /*
         * Rounded up as an arrival, but never past the leg's own published
         * arrival: a stop passed in the same minute the leg ends in must not
         * read later than the end of the ride. Never before its start either,
         * which rounding up from a later moment cannot do.
         */
        const intermediateStopFormattedArrivalTime = convertSecondsToTimeOfDay(
          Math.min(
            roundSecondsToMinute(stop["stopArrivalTimeSeconds"], "ceil"),
            legEndSeconds,
          ),
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

    const formattedLegEndTime = convertSecondsToTimeOfDay(legEndSeconds);

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
      /*
       * Which of the line's stop sequences this leg rode.
       *
       * `lineId` alone cannot answer it: HSL's tram H has thirty-nine patterns
       * under one designation, and a client wanting to show the rider *this*
       * run of the line has no way to pick between them. The engine already
       * knows — it scanned this exact pattern — so saying so costs nothing and
       * saves a client from fetching every variant to search for its own trip.
       *
       * Stable for the life of a dataset but not across a pipeline re-run, the
       * same caveat `/api/routes` states for the ids it hands out.
       */
      patternId: internalRouteId,
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
