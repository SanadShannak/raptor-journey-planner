// Trigger the cold-start memory caching
const memoryCache = require("../memoryCache");

const cachedData = memoryCache.getCache();
const footpaths = cachedData.footpaths;
const routes = cachedData.routes;
const stopMapping = cachedData.stopMapping;
const stops = cachedData.stops;
const timetables = cachedData.timetables;
const stopToRoutes = cachedData.stopToRoutes;
const activeServices = cachedData.activeServices;
const reverseTripMapping = cachedData.reverseTripMapping;
const calculateTimeOfDayInSeconds = require("./utils/calculateTimeOfDayInSeconds");
const convertDateToDateId = require("./utils/convertDateToDateId");
const getNearbyStops = require("./utils/getNearbyStops");
const calculateHaversine = require("./utils/calculateHaversine");
const injectTransitShape = require("./utils/injectTransitShape");
const MAX_ROUNDS = 6;
const DETOUR_FACTOR = 1.2; // Simulates real sidewalk routing instead of straight line walking

function checkStopOrderInRoute(route_index, stop1, stop2) {
  // Helper function for Stage 1 of the RAPTOR algorithm, returns True if stop1 is visited before stop2 in the provided route, false otherwise
  const route = routes[route_index];

  const firstStopOrderInRoute = route["stop_order_map"][stop1];
  const secondStopOrderInRoute = route["stop_order_map"][stop2];

  return firstStopOrderInRoute < secondStopOrderInRoute;
}

function getEarliestTrip(
  route,
  departureStopIndex,
  arrivalTime,
  serviceOffsets,
) {
  // Function to get -for a given route- the earliest trip leaving from a specific stop after a given time on the query day
  const routeData = routes[route];
  const routeServices = Object.keys(routeData["service_buckets"]);

  let earliestDepartureTime = Infinity;
  let earliestTrip = null;
  let bestOffset = 0;

  for (let serviceId of routeServices) {
    // Grab the array of offsets for this service (e.g: [-86640, 0])
    const offsets = serviceOffsets[serviceId];
    if (!offsets) continue;

    const currentStopAllDepartureTimeForCurrentService =
      routeData["service_buckets"][serviceId][departureStopIndex];
    const serviceTrips = routeData["service_buckets"][serviceId]["trip_ids"];

    // Binary Search for every offset
    for (let offsetIndex = 0; offsetIndex < offsets.length; offsetIndex++) {
      const offset = offsets[offsetIndex];
      // Shift the target time relative to the timetable's day
      const currentOffsetTargetTime = arrivalTime - offset;

      // Binary search
      let lower = 0;
      let upper = currentStopAllDepartureTimeForCurrentService.length - 1;
      let resultIndex = -1;
      while (lower <= upper) {
        const mid = Math.floor((lower + upper) / 2);
        if (
          currentStopAllDepartureTimeForCurrentService[mid] >=
          currentOffsetTargetTime
        ) {
          resultIndex = mid;
          upper = mid - 1;
        } else {
          lower = mid + 1;
        }
      }
      if (resultIndex !== -1) {
        // Translate the found time back to the absolute engine clock's time
        const absoluteFoundTime =
          currentStopAllDepartureTimeForCurrentService[resultIndex] + offset;
        if (absoluteFoundTime < earliestDepartureTime) {
          earliestDepartureTime = absoluteFoundTime;
          earliestTrip = serviceTrips[resultIndex];
          bestOffset = offset;
        }
      }
    }
  }
  if (earliestTrip !== null) return { trip: earliestTrip, offset: bestOffset };
  return null;
}

function getDateForTimestamp(queryDate, timestampInSeconds) {
  const SECONDS_IN_DAY = 86400;

  // Calculate how many full days to shift from the query date
  const dayOffset = Math.floor(timestampInSeconds / SECONDS_IN_DAY);

  // Calculate the remaining seconds of the day (handling negative mod)
  const timeOfDaySeconds =
    ((timestampInSeconds % SECONDS_IN_DAY) + SECONDS_IN_DAY) % SECONDS_IN_DAY;

  // Construct the target Date object based on the query date + day offset
  const baseDate = new Date(queryDate);
  baseDate.setDate(baseDate.getDate() + dayOffset);

  // Add the time of day to the date object
  const hours = Math.floor(timeOfDaySeconds / 3600);
  const minutes = Math.floor((timeOfDaySeconds % 3600) / 60);
  const seconds = timeOfDaySeconds % 60;

  baseDate.setHours(hours, minutes, seconds, 0);

  return baseDate;
}

function raptorEngine(
  sourceNode,
  targetNode,
  queryDate,
  departureTime,
  WALKING_SPEED_MPS = 1.27778, // Average human walking pace (meters/sec)
) {
  // sourceStop & targetStop must be in their original ID format
  // departureTime must be in string format: HH:MM:SS
  // queryDate must be in string format: YYYY-MM-DD

  console.log("RAPTOR ENGINE RUNNING.");

  // Edge Case: Source & Target are the same
  if (sourceNode.type === targetNode.type) {
    if (sourceNode.type === "stop" && sourceNode.id === targetNode.id) {
      return {
        targetArrivalTime: null,
        legs: [],
        errorCode: "SAME_ORIGIN_TARGET",
        error:
          "No route suggestions were found because the departure point is the same as the destination.",
      };
    }
    if (
      sourceNode.type === "coordinate" &&
      sourceNode.lat === targetNode.lat &&
      sourceNode.lon === targetNode.lon
    ) {
      return {
        targetArrivalTime: null,
        legs: [],
        errorCode: "SAME_ORIGIN_TARGET",
        error:
          "No route suggestions were found because the departure point is the same as the destination.",
      };
    }
  }

  // Initialization of the algorithm (Lines 1-5 in the research paper)

  // console.log("Initializing the algorithm... ");
  // Initialize array to hold arrival times for each round up to MAX_ROUNDS
  const arrivalTimes = [];
  // Initialize set to track stops updated in the current round
  const markedStops = new Set();
  for (let roundNumber = 0; roundNumber <= MAX_ROUNDS; roundNumber++) {
    // Pre-allocation of the 2D arrival matrix with native Infinity fills
    arrivalTimes[roundNumber] = new Array(stops.length).fill(Infinity);
  }
  // Filling the best arrival times matrix with native Infinity fills
  const bestArrivalTimes = new Array(stops.length).fill(Infinity);

  // Load Yesterday, Today, and Tomorrow to handle overnight GTFS boundaries
  const queryDateObj = new Date(queryDate);
  const yesterdayObj = new Date(queryDateObj);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const tomorrowObj = new Date(queryDateObj);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);

  // Convert the query dates to match the mapping date id format in the activeServices object
  const yesterdayId = convertDateToDateId(
    yesterdayObj.toISOString().split("T")[0],
  );
  const todayId = convertDateToDateId(queryDate);
  const tomorrowId = convertDateToDateId(
    tomorrowObj.toISOString().split("T")[0],
  );

  // Fetch the array of active services for that specific day
  const activeServicesYesterday = activeServices[yesterdayId] || [];
  const activeServicesToday = activeServices[todayId] || [];
  const activeServicesTomorrow = activeServices[tomorrowId] || [];

  // Return descriptive error code if no public transit services are scheduled for the queried date (and around it)
  if (
    activeServicesToday.length === 0 &&
    activeServicesYesterday.length === 0 &&
    activeServicesTomorrow.length === 0
  ) {
    return {
      targetArrivalTime: null,
      legs: [],
      errorCode: "NO_ACTIVE_SERVICES",
      error:
        "No transit services are active or scheduled for operation on the requested date.",
    };
  }

  // O(1) map linking service_ids to their time offsets
  // E.g., { "4153": [0], "4154": [-86400, 0] }
  const serviceOffsets = {};

  // Helper function to assign the offsets for binary searching through the each service
  function assignOffsets(services, offset) {
    for (let serviceIndex = 0; serviceIndex < services.length; serviceIndex++) {
      if (!Object.hasOwn(serviceOffsets, services[serviceIndex])) {
        serviceOffsets[services[serviceIndex]] = [];
      }
      serviceOffsets[services[serviceIndex]].push(offset);
    }
  }

  assignOffsets(activeServicesYesterday, -86400); // Yesterday's Trips Shifted Back By 86640 seconds (1 day)
  assignOffsets(activeServicesToday, 0);
  assignOffsets(activeServicesTomorrow, 86400); // Tomorrow's Trips Shifted Forward By 86640 seconds (1 day)

  // Array to hold the initial boarding locations derived from origin input
  const startingStops = [];
  // Array to hold the destination locations derived from target input
  const targetStops = [];
  // Tracks the global minimum arrival time found so far at any target stop
  let globalBestTargetArrivalTime = Infinity;
  // Path reconstruction matrices
  // 2D matrix tracking the parent stop ID for each stop in each round
  const parentStop = [];
  // 2D matrix tracking the trip ID used to reach each stop in each round
  const parentTrip = [];
  // 2D matrix tracking metadata (route ID / walk duration) used to reach each stop
  const parentRoute = [];
  // 2D matrix tracking exact walk distances in meters for footpath/origin/destination legs
  const parentWalkDistance = [];
  // 2D matrix tracking the day offset used for the leg
  const parentTripOffset = [];

  // Convert query departure time string into total seconds elapsed since midnight
  const departureSeconds = calculateTimeOfDayInSeconds(departureTime);

  for (let roundNumber = 0; roundNumber <= MAX_ROUNDS; roundNumber++) {
    // Pre-allocation of matrices with native fills
    parentStop[roundNumber] = new Array(stops.length).fill(null);
    parentTrip[roundNumber] = new Array(stops.length).fill(null);
    parentRoute[roundNumber] = new Array(stops.length).fill(null);
    parentWalkDistance[roundNumber] = new Array(stops.length).fill(null);
    parentTripOffset[roundNumber] = new Array(stops.length).fill(0);
  }
  // If origin/target not a saved stop, get nearby stops
  if (sourceNode.type == "coordinate") {
    // Retrieve nearby transit stops within walking reach of origin coordinates
    const rawNearbyStops = getNearbyStops(sourceNode.lat, sourceNode.lon);
    if (rawNearbyStops.length === 0) {
      return {
        targetArrivalTime: null,
        legs: [],
        errorCode: "ORIGIN_OUT_OF_BOUNDS",
        error:
          "No route suggestions were found because the departure point is outside the service area.",
      };
    }
    // Compute total walk duration + stop access penalty
    const nearbyStops = [];
    rawNearbyStops.forEach((nearbyStop) => {
      const walkingDuration = Math.round(
        nearbyStop.walkDistanceMeters / WALKING_SPEED_MPS,
      );
      const totalWalkDuration = walkingDuration + nearbyStop.stopAccessPenalty;

      nearbyStops.push({
        stop: nearbyStop.stop,
        walkDurationSeconds: totalWalkDuration,
        walkDistanceMeters: nearbyStop.walkDistanceMeters,
      });
    });
    startingStops.push(...nearbyStops);
  } else if (sourceNode.type == "stop") {
    // Mapping the source stop id to its index in the flat array
    const sourceStopIndex = stopMapping[sourceNode.id];

    // Return error code if the requested source stop ID does not exist in mapping dictionary
    if (sourceStopIndex === undefined) {
      return {
        targetArrivalTime: null,
        legs: [],
        errorCode: "ORIGIN_STOP_NOT_FOUND",
        error:
          "The specified origin stop ID does not exist in the transit network database.",
      };
    }
    // Push the source stop and its arrival time
    startingStops.push({
      stop: sourceStopIndex,
      walkDurationSeconds: 0,
      walkDistanceMeters: 0,
    });
  }

  startingStops.forEach((startingNode) => {
    const stop = startingNode.stop;
    const arrivalTimeAtStop =
      departureSeconds + startingNode.walkDurationSeconds;
    arrivalTimes[0][stop] = arrivalTimeAtStop;
    bestArrivalTimes[stop] = arrivalTimeAtStop;
    // Adding the source stop to the 'marked' stops set to begin traversing
    markedStops.add(stop);

    //Initialize the starting node itself
    parentStop[0][startingNode.stop] = "ORIGIN";
    parentTrip[0][startingNode.stop] = -1;
    parentRoute[0][startingNode.stop] = startingNode.walkDurationSeconds;
    // Stash the origin walk distance
    // Stash the origin walk distance
    parentWalkDistance[0][startingNode.stop] =
      startingNode.walkDistanceMeters || 0;
  });

  if (targetNode.type === "coordinate") {
    // Retrieve nearby transit stops within walking reach of destination coordinates
    const rawNearbyTargets = getNearbyStops(targetNode.lat, targetNode.lon);
    if (rawNearbyTargets.length === 0) {
      return {
        targetArrivalTime: null,
        legs: [],
        errorCode: "DESTINATION_OUT_OF_BOUNDS",
        error:
          "No route suggestions were found because the destination point is outside the service area.",
      };
    }
    // Compute total walk duration + stop access penalty
    const nearbyTargets = [];
    rawNearbyTargets.forEach((nearbyTarget) => {
      const walkingDuration = Math.round(
        nearbyTarget.walkDistanceMeters / WALKING_SPEED_MPS,
      );
      const totalWalkDuration =
        walkingDuration + nearbyTarget.stopAccessPenalty;

      nearbyTargets.push({
        stop: nearbyTarget.stop,
        walkDurationSeconds: totalWalkDuration,
        walkDistanceMeters: nearbyTarget.walkDistanceMeters,
      });
    });
    targetStops.push(...nearbyTargets);
  } else if (targetNode.type === "stop") {
    const targetStopIndex = stopMapping[targetNode.id];
    // Return error code if the requested target stop ID does not exist in mapping dictionary
    if (targetStopIndex === undefined) {
      return {
        targetArrivalTime: null,
        legs: [],
        errorCode: "DESTINATION_STOP_NOT_FOUND",
        error:
          "The specified destination stop ID does not exist in the transit network database.",
      };
    }
    targetStops.push({
      stop: targetStopIndex,
      walkDurationSeconds: 0,
      walkDistanceMeters: 0,
    });
  }
  for (let currentRound = 1; currentRound <= MAX_ROUNDS; currentRound++) {
    // Stage 1: Route Accumulation (Lines 6-14 in the research paper)
    // console.log("Stage 1: Route Accumulation... ");

    // Empty map to store routes serving all marked stops to be explored by later stages
    const routesServingMarkedStops = new Map();
    // Iterate over each marked stop to find routes that serve that stop
    markedStops.forEach((markedStop) => {
      // All routes serving current stop
      const routesServingCurrentMarkedStop = stopToRoutes[markedStop] || [];
      // Check each route serving current stop
      routesServingCurrentMarkedStop.forEach((route) => {
        // The route is already in the map of all routes
        if (routesServingMarkedStops.has(route)) {
          // Get the stop that this route is already serving
          const previouslyStoredStop = routesServingMarkedStops.get(route);
          // If the new stop being served by this route is ordered before the previous stop, then replace the previous stop with the new stop
          if (checkStopOrderInRoute(route, markedStop, previouslyStoredStop)) {
            routesServingMarkedStops.set(route, markedStop);
          }
        } else {
          // If the route is not already in the map of all routes, add it
          routesServingMarkedStops.set(route, markedStop);
        }
      });
    });

    // Clear the markedStops set after all marked stop have been explored
    markedStops.clear();

    // Stage 2: Route Scanning (Lines 15-23 in the research paper)
    // console.log("Stage 2: Route Scanning... ");

    // Traverse each route
    routesServingMarkedStops.forEach((currentStop, route) => {
      // Holds the currently boarded trip ID during route traversal
      let currentTrip = null;
      // Tracks the time shift for the boarded trip
      let currentTripOffset = 0;

      // Holds the stop ID where the current trip was boarded
      let boardingStop = null;
      // Get the stop list of the route
      const routeStopList = routes[route]["stop_ids"];
      // Get the index of the stop in the route (its order in that route)

      const stopIndexInRoute = routes[route]["stop_order_map"][currentStop];
      // Traverse each stop of the route, beginning with boarding stop
      for (
        let nextStopIndex = stopIndexInRoute;
        nextStopIndex < routeStopList.length;
        nextStopIndex++
      ) {
        // Get the flat array index of the stop currently being traversed
        const nextStop = routeStopList[nextStopIndex];
        // If there is a trip currently boarded
        if (currentTrip != null) {
          // Get the arrival time of the boarded trip at this stop
          const currentTripArrivalTimeAtCurrentStop =
            timetables[currentTrip][nextStopIndex]["arrival"] +
            currentTripOffset;
          // Local & Target Pruning: Keep the trip if the new arrival time is better than the best arrival time at this stop and at the target stop, else discard trip
          if (
            currentTripArrivalTimeAtCurrentStop <
            Math.min(bestArrivalTimes[nextStop], globalBestTargetArrivalTime)
          ) {
            arrivalTimes[currentRound][nextStop] =
              currentTripArrivalTimeAtCurrentStop;
            bestArrivalTimes[nextStop] = currentTripArrivalTimeAtCurrentStop;
            // Set the parent stop & trip (For path reconstruction)
            parentStop[currentRound][nextStop] = boardingStop;
            parentTrip[currentRound][nextStop] = currentTrip;
            parentRoute[currentRound][nextStop] = route;
            parentWalkDistance[currentRound][nextStop] = null; // Transit leg has no walk distance
            parentTripOffset[currentRound][nextStop] = currentTripOffset;
            // Mark the stop if it its arrival times were updated
            markedStops.add(nextStop);
            // Is this newly updated stop one of our destinations
            for (let i = 0; i < targetStops.length; i++) {
              if (targetStops[i].stop === nextStop) {
                const totalTime =
                  arrivalTimes[currentRound][nextStop] +
                  targetStops[i].walkDurationSeconds;
                if (totalTime < globalBestTargetArrivalTime) {
                  globalBestTargetArrivalTime = totalTime;
                }
              }
            }
          }
        }
        // Get the arrival time of the previous round at the current stop
        const previousRoundArrivalTimeAtCurrentStop =
          arrivalTimes[currentRound - 1][nextStop];
        // Make sure the stop has already been explored
        if (previousRoundArrivalTimeAtCurrentStop !== Infinity) {
          if (
            // If there isn't a currently boarded trip, or the we had arrived at this stop earlier in the previous round, so we might be able to catch an earlier trip
            currentTrip === null ||
            previousRoundArrivalTimeAtCurrentStop <=
              timetables[currentTrip][nextStopIndex]["departure"] +
                currentTripOffset
          ) {
            const earliestFoundTrip = getEarliestTrip(
              route,
              nextStopIndex,
              previousRoundArrivalTimeAtCurrentStop,
              serviceOffsets,
            );
            if (earliestFoundTrip !== null) {
              currentTrip = earliestFoundTrip.trip;
              currentTripOffset = earliestFoundTrip.offset;
              boardingStop = nextStop;
            }
          }
        }
      }
    });

    // Stage 3: Footpath Processing (Lines 24-27 in the research paper)

    // Spread the stops marked from stage 2 into a new array to look at possible footpaths
    const stopsToProcessForFootpaths = [...markedStops];
    stopsToProcessForFootpaths.forEach((currentStop) => {
      // If we got to this stop in this exact round by walking , do not branch our into more walks
      if (parentTrip[currentRound][currentStop] === -1) {
        return;
      }
      // Get the walking-distance neighboring stops footpath details, if any
      const currentStopFootpaths = footpaths[currentStop] || [];
      // For each footpath, check if walking from our current stop to the neighboring stop gets us faster than our previously calculated time of arrival at the neighboring stop
      currentStopFootpaths.forEach((footpath) => {
        const footpathNextStop = footpath["to_stop_id"];
        const footpathDistance = footpath["distance"];

        // Prevent considering a footpath to the same stop
        if (footpathDistance < 1) {
          return;
        }

        const footpathDuration = Math.round(
          footpathDistance / WALKING_SPEED_MPS,
        );
        const footpathStationPenalty = footpath["stop_access_penalty"];
        const footpathArrivalTime =
          arrivalTimes[currentRound][currentStop] +
          footpathDuration +
          footpathStationPenalty;
        // Target & Local Pruning
        if (
          footpathArrivalTime <
          Math.min(
            bestArrivalTimes[footpathNextStop],
            globalBestTargetArrivalTime,
          )
        ) {
          arrivalTimes[currentRound][footpathNextStop] = footpathArrivalTime;
          bestArrivalTimes[footpathNextStop] = footpathArrivalTime;
          // Set the parent stop & trip (For path reconstruction)
          parentStop[currentRound][footpathNextStop] = currentStop;
          parentTrip[currentRound][footpathNextStop] = -1;
          parentTripOffset[currentRound][footpathNextStop] = 0;
          parentRoute[currentRound][footpathNextStop] =
            footpathDuration + footpathStationPenalty;
          // Store exact pre-calculated footpath distance directly
          parentWalkDistance[currentRound][footpathNextStop] = footpathDistance;

          // Mark the newly updated stop to process next round
          markedStops.add(footpathNextStop);
          // Is this newly updated stop one of our destinations
          for (let i = 0; i < targetStops.length; i++) {
            if (targetStops[i].stop === footpathNextStop) {
              const totalTime =
                arrivalTimes[currentRound][footpathNextStop] +
                targetStops[i].walkDurationSeconds;
              if (totalTime < globalBestTargetArrivalTime) {
                globalBestTargetArrivalTime = totalTime;
              }
            }
          }
        }
      });
    });
    // Stopping Criterion: If no stops are marked, STOP.
    if (markedStops.size === 0) {
      break;
    }
  }

  // Pick the Winning Target Stop
  let winningArrivalTime = Infinity;
  let candidateTargets = []; // Store all targets that tie for the fastest time

  targetStops.forEach((target) => {
    const arrivalAtStation = bestArrivalTimes[target.stop];
    if (arrivalAtStation === Infinity) return;

    const totalArrivalTime = arrivalAtStation + target.walkDurationSeconds;

    if (totalArrivalTime < winningArrivalTime) {
      winningArrivalTime = totalArrivalTime;
      candidateTargets = [target]; // Reset the array with the new absolute winner
    } else if (totalArrivalTime === winningArrivalTime) {
      candidateTargets.push(target); // Add to the ties
    }
  });

  // If we couldn't reach ANY target station (fail), return null
  if (candidateTargets.length === 0) {
    return {
      targetArrivalTime: null,
      legs: [],
      errorCode: "NO_ROUTE_FOUND",
      error:
        "No valid transit itinerary could be found connecting the origin and destination for the requested time.",
    };
  }

  // Holds the selected optimal itinerary object returned by path reconstruction
  let bestItinerary = null;
  // Tracks the minimum accumulated walking duration across winning candidate paths
  let lowestTotalWalkTime = Infinity;

  function buildItinerary(candidate) {
    const targetStop = candidate.stop;
    const finalWalkSeconds = candidate.walkDurationSeconds;
    const finalWalkDistance = candidate.walkDistanceMeters;
    // Find the minimum number of rounds (transfers) required to achieve the best arrival time
    let bestRound = 0;
    while (
      arrivalTimes[bestRound][targetStop] !== bestArrivalTimes[targetStop]
    ) {
      bestRound++;
    }

    // Initialize the final itinerary object to be returned to the API layer
    const itineraryDetails = {
      targetArrivalTime: bestArrivalTimes[targetStop],
      legs: [],
    };

    // Traverse backwards from the target stop to the source stop to reconstruct the path
    let stopPointer = targetStop;
    let backwardRound = bestRound;

    while (parentStop[backwardRound][stopPointer] !== "ORIGIN") {
      const tripUsed = parentTrip[backwardRound][stopPointer];
      const previousStop = parentStop[backwardRound][stopPointer];
      const routeUsed = parentRoute[backwardRound][stopPointer];
      const walkDistance = parentWalkDistance[backwardRound][stopPointer];
      // Retrieve the offset used for this specific trip
      const tripOffset = parentTripOffset[backwardRound][stopPointer];
      // If a footpath was used (tripUsed === -1), stay in the same round. If transit was used, step back one round
      const previousRound = tripUsed === -1 ? backwardRound : backwardRound - 1;

      // Find the order index of the boarding stop within the route for timetable lookup & intermediate stop list construction
      const previousStopOrderInRoute =
        tripUsed === -1
          ? null
          : routes[routeUsed]["stop_order_map"][previousStop];
      // Find the order index of the disembarking stop within the route for & intermediate stop list construction
      const disembarkingStopOrderInRoute =
        tripUsed === -1
          ? null
          : routes[routeUsed]["stop_order_map"][stopPointer];

      const intermediateStops = [];
      // Extract intermediate stops with Arrival Times
      if (tripUsed !== -1) {
        // Loop through the stops between boarding and disembarking
        for (
          let stopIndexInRoute = previousStopOrderInRoute + 1;
          stopIndexInRoute < disembarkingStopOrderInRoute;
          stopIndexInRoute++
        ) {
          const intermediateStopInternalId =
            routes[routeUsed]["stop_ids"][stopIndexInRoute];
          // Grab the arrival time from the timetable and apply the time-travel offset
          const scheduledStopArrivalTimeSeconds =
            timetables[tripUsed][stopIndexInRoute]["arrival"] + tripOffset;

          intermediateStops.push({
            stopName: stops[intermediateStopInternalId]["name"],
            stopId: stops[intermediateStopInternalId]["gtfs_id"],
            stopCode: stops[intermediateStopInternalId]["stop_code"],
            stopLat: stops[intermediateStopInternalId]["lat"],
            stopLon: stops[intermediateStopInternalId]["lon"],
            stopArrivalTimeSeconds: scheduledStopArrivalTimeSeconds,
          });
        }
      }

      // Fetch exact departure time from timetable for transit legs, or null for walking legs
      const exactDepartureSeconds =
        tripUsed === -1
          ? null
          : timetables[tripUsed][previousStopOrderInRoute]["departure"] +
            tripOffset;

      // Get the time the user arrived at the boarding platform in the previous round
      const platformArrivalSeconds = arrivalTimes[previousRound][previousStop];

      // Get the exact distance traveled (in KM) if the leg was TRANSIT
      const distanceTraveledMeters =
        tripUsed === -1
          ? null
          : Object.hasOwn(routes[routeUsed], "stop_distance_traveled")
            ? (routes[routeUsed]["stop_distance_traveled"][
                disembarkingStopOrderInRoute
              ] -
                routes[routeUsed]["stop_distance_traveled"][
                  previousStopOrderInRoute
                ]) *
              1000
            : null;

      const legStartTime =
        tripUsed === -1
          ? arrivalTimes[backwardRound][stopPointer] - routeUsed
          : timetables[tripUsed][previousStopOrderInRoute]["departure"] +
            tripOffset;
      const legEndTime = arrivalTimes[backwardRound][stopPointer];

      // Construct the detailed segment (leg) object containing wait, walk, transit, and timing data

      const currentLeg = {
        waitDurationSeconds:
          tripUsed === -1 ? 0 : exactDepartureSeconds - platformArrivalSeconds,
        startDate: getDateForTimestamp(
          queryDate,
          legStartTime,
        ).toLocaleDateString("en-CA"),
        startTime: legStartTime,
        fromStop: {
          id: stops[previousStop]["gtfs_id"],
          name: stops[previousStop]["name"],
          code: stops[previousStop]["stop_code"],
          platform: stops[previousStop]["platform"] ?? null,
          lat: stops[previousStop]["lat"],
          lon: stops[previousStop]["lon"],
        },
        routeShortName:
          tripUsed === -1 ? null : routes[routeUsed]["short_name"],
        routeType: tripUsed === -1 ? null : routes[routeUsed]["route_type"],
        /*
         * Internal handles for the presenter, which needs them to look up the
         * line's direction, long name, and destination sign. They are stripped
         * in formatItinerary and never reach a response: a pattern index is
         * only meaningful until the next pipeline run.
         *
         * Emitted here because this is the only scope that has them. Nothing
         * about the routing itself reads them back.
         */
        internalRouteId: tripUsed === -1 ? null : routeUsed,
        internalTripId: tripUsed === -1 ? null : tripUsed,
        intermediateStops: tripUsed === -1 ? null : intermediateStops,
        toStop: {
          id: stops[stopPointer]["gtfs_id"],
          name: stops[stopPointer]["name"],
          code: stops[stopPointer]["stop_code"],
          platform: stops[stopPointer]["platform"] ?? null,
          lat: stops[stopPointer]["lat"],
          lon: stops[stopPointer]["lon"],
        },
        endDate: getDateForTimestamp(queryDate, legEndTime).toLocaleDateString(
          "en-CA",
        ),
        endTime: legEndTime,
        mode: tripUsed === -1 ? "WALK" : "TRANSIT",
        tripId: tripUsed === -1 ? null : reverseTripMapping[tripUsed],
        transitDurationSeconds:
          tripUsed === -1
            ? null
            : arrivalTimes[backwardRound][stopPointer] -
              (timetables[tripUsed][previousStopOrderInRoute]["departure"] +
                tripOffset),
        transitDistanceMeters: distanceTraveledMeters,
        walkDurationSeconds: tripUsed === -1 ? routeUsed : null,
        walkDistanceMeters: tripUsed === -1 ? walkDistance : null,
        shape:
          tripUsed === -1
            ? [
                [stops[previousStop]["lat"], stops[previousStop]["lon"]],
                [stops[stopPointer]["lat"], stops[stopPointer]["lon"]],
              ]
            : injectTransitShape(tripUsed, previousStop, stopPointer, stops),
      };

      itineraryDetails.legs.push(currentLeg);

      // Shift pointers backwards for the next iteration of the loop
      stopPointer = previousStop;
      backwardRound = previousRound;
    }

    // Reverse the legs array since we built it from target to source
    itineraryDetails.legs.reverse();

    if (sourceNode.type === "coordinate") {
      const initialWalkSeconds = parentRoute[0][stopPointer]; // Stashed in Round 0
      // Retrieve pre-calculated distance stashed in Round 0 for initial origin walk
      const initialWalkDistance = parentWalkDistance[0][stopPointer];

      // Look at the upcoming transit leg to see how long the user was going to wait at the station
      const firstTransitLeg = itineraryDetails.legs[0];
      const waitTimeToShift = firstTransitLeg
        ? firstTransitLeg.waitDurationSeconds
        : 0;

      // Shift the departure forward so the user doesn't wait at the station
      const shiftedDepartureSeconds = departureSeconds + waitTimeToShift;

      itineraryDetails.legs.unshift({
        waitDurationSeconds: 0,
        startDate: getDateForTimestamp(
          queryDate,
          shiftedDepartureSeconds,
        ).toLocaleDateString("en-CA"),

        startTime: shiftedDepartureSeconds,
        fromStop: {
          name: "ORIGIN",
          id: null,
            code: "ORIGIN_PIN",
            platform: null,
          lat: sourceNode.lat,
          lon: sourceNode.lon,
        },
        routeShortName: null,
        routeType: null,

        intermediateStops: null,
        toStop: {
          id: stops[stopPointer]["gtfs_id"],
          name: stops[stopPointer]["name"],
          code: stops[stopPointer]["stop_code"],
          platform: stops[stopPointer]["platform"] ?? null,
          lat: stops[stopPointer]["lat"],
          lon: stops[stopPointer]["lon"],
        },
        endDate: getDateForTimestamp(
          queryDate,
          shiftedDepartureSeconds + initialWalkSeconds,
        ).toLocaleDateString("en-CA"),

        endTime: shiftedDepartureSeconds + initialWalkSeconds,
        mode: "WALK",
        tripId: null,
        transitDurationSeconds: null,
        transitDistanceMeters: null,
        walkDurationSeconds: initialWalkSeconds,
        walkDistanceMeters: initialWalkDistance,
        shape: [
          [sourceNode.lat, sourceNode.lon],
          [stops[stopPointer]["lat"], stops[stopPointer]["lon"]],
        ],
      });

      // Now that we shifted the walk forward, the user doesn't have to wait at the station!
      if (firstTransitLeg) {
        firstTransitLeg.waitDurationSeconds = 0;
      }
    } else {
      // If the user started directly at a station, just zero out the wait time
      if (itineraryDetails.legs.length > 0) {
        itineraryDetails.legs[0].waitDurationSeconds = 0;
      }
    }

    // If the destination was a coordinate, inject the final walking leg from the bus stop to the pin
    if (targetNode.type === "coordinate" && finalWalkSeconds > 0) {
      // The user arrived at the final bus stop at this exact time
      const finalStationArrivalSeconds = arrivalTimes[bestRound][targetStop];

      itineraryDetails.legs.push({
        waitDurationSeconds: 0,
        startDate: getDateForTimestamp(
          queryDate,
          finalStationArrivalSeconds,
        ).toLocaleDateString("en-CA"),

        startTime: finalStationArrivalSeconds,

        fromStop: {
          id: stops[targetStop]["gtfs_id"],
          name: stops[targetStop]["name"],
          code: stops[targetStop]["stop_code"],
          platform: stops[targetStop]["platform"] ?? null,
          lat: stops[targetStop]["lat"],
          lon: stops[targetStop]["lon"],
        },
        routeShortName: null,
        routeType: null,

        intermediateStops: null,
        toStop: {
          name: "TARGET",
          id: null,
            code: "TARGET_PIN",
            platform: null,
          lat: targetNode.lat,
          lon: targetNode.lon,
        },
        endDate: getDateForTimestamp(
          queryDate,
          finalStationArrivalSeconds + finalWalkSeconds,
        ).toLocaleDateString("en-CA"),

        endTime: finalStationArrivalSeconds + finalWalkSeconds,
        mode: "WALK",
        tripId: null,
        transitDurationSeconds: null,
        transitDistanceMeters: null,
        walkDurationSeconds: finalWalkSeconds,
        walkDistanceMeters: finalWalkDistance,
        shape: [
          [stops[targetStop]["lat"], stops[targetStop]["lon"]],
          [targetNode.lat, targetNode.lon],
        ],
      });

      // Update the overarching itinerary arrival time to include this final walk
      itineraryDetails.targetArrivalTime =
        finalStationArrivalSeconds + finalWalkSeconds;
    }

    // Array holding compressed consecutive walking legs merged together
    const compressedLegs = [];

    for (let i = 0; i < itineraryDetails.legs.length; i++) {
      const currentLeg = itineraryDetails.legs[i];
      const previousLeg = compressedLegs[compressedLegs.length - 1];

      if (
        previousLeg &&
        previousLeg.mode === "WALK" &&
        currentLeg.mode === "WALK"
      ) {
        // Merge the current walk into the previous one
        previousLeg.toStop = currentLeg.toStop;
        previousLeg.endTime = currentLeg.endTime;
        previousLeg.endDate = currentLeg.endDate;
        previousLeg.walkDurationSeconds += currentLeg.walkDurationSeconds;
        previousLeg.walkDistanceMeters += currentLeg.walkDistanceMeters;
        previousLeg.shape.push(...currentLeg.shape.slice(1));
      } else {
        compressedLegs.push(currentLeg);
      }
    }

    itineraryDetails.legs = compressedLegs;

    return itineraryDetails;
  }

  candidateTargets.forEach((candidate) => {
    // Reconstruct the path for this specific candidate.stop
    const itinerary = buildItinerary(candidate);

    // Sum up all the walking time in this itinerary
    let totalWalkTime = 0;
    itinerary.legs.forEach((leg) => {
      if (leg.mode === "WALK") {
        totalWalkTime += leg.walkDurationSeconds;
      }
    });

    // Keep it if it has the least walking time
    if (totalWalkTime < lowestTotalWalkTime) {
      lowestTotalWalkTime = totalWalkTime;
      bestItinerary = itinerary;
    }
  });

  // Direct Walking Path Fallback
  // Boolean flag indicating if direct walking is faster than transit routing
  let isDirectWalkBetter = false;
  // Estimated duration in seconds for a direct walk between coordinates
  let directWalkingDuration = 0;
  // Calculated arrival time timestamp for a direct walking trip
  let directWalkingArrivalTime = Infinity;
  let directRealDistance = 0;

  if (sourceNode.type === "coordinate" && targetNode.type === "coordinate") {
    const directHaversineDistance = calculateHaversine(
      sourceNode.lat,
      sourceNode.lon,
      targetNode.lat,
      targetNode.lon,
    );
    directRealDistance =
      Math.round((directHaversineDistance * DETOUR_FACTOR) / 10) * 10;

    directWalkingDuration = Math.round(directRealDistance / WALKING_SPEED_MPS);
    directWalkingArrivalTime = departureSeconds + directWalkingDuration;

    if (
      bestItinerary === null ||
      directWalkingArrivalTime < bestItinerary.targetArrivalTime
    ) {
      isDirectWalkBetter = true;
    }
  }

  if (isDirectWalkBetter || bestItinerary === null) {
    return {
      targetArrivalTime: directWalkingArrivalTime,
      legs: [
        {
          waitDurationSeconds: 0,
          startDate: getDateForTimestamp(
            queryDate,
            departureSeconds,
          ).toLocaleDateString("en-CA"),

          startTime: departureSeconds,
          fromStop: {
            name: "ORIGIN",
            id: null,
            code: "ORIGIN_PIN",
            platform: null,
            lat: sourceNode.lat,
            lon: sourceNode.lon,
          },
          routeShortName: null,
          routeType: null,
          intermediateStops: null,
          toStop: {
            name: "TARGET",
            id: null,
            code: "TARGET_PIN",
            platform: null,
            lat: targetNode.lat,
            lon: targetNode.lon,
          },
          endDate: getDateForTimestamp(
            queryDate,
            directWalkingArrivalTime,
          ).toLocaleDateString("en-CA"),

          endTime: directWalkingArrivalTime,
          mode: "WALK",
          tripId: null,
          transitDurationSeconds: null,
          transitDistanceMeters: null,
          walkDurationSeconds: directWalkingDuration,
          walkDistanceMeters: directRealDistance,
          shape: [
            [sourceNode.lat, sourceNode.lon],
            [targetNode.lat, targetNode.lon],
          ],
        },
      ],
    };
  }

  return bestItinerary;
}

// console.dir(
//   raptorEngine(
//     { type: "stop", id: "4810243" },
//     { type: "stop", id: "4850204" },

//     "2026-09-13",
//     "11:59:00",
//   ),
//   { depth: null },
// );

// console.dir(
//   raptorEngine(
//     { type: "coordinate", lat: -33.866996978263366, lon: 151.20638698339462 },
//     { type: "coordinate", lat: -33.86711947020288, lon: 151.20672762393954 },
//     "2026-09-14",
//     "02:00:00",
//   ),
//   { depth: null },
// );

module.exports = raptorEngine;
