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
const convertSecondsToTimeOfDay = require("./utils/convertSecondsToTimeOfDay");
const getNearbyStops = require("./utils/getNearbyStops");
const calculateHaversine = require("./utils/calculateHaversine");
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
  queryDayActiveServicesMap,
) {
  // Function to get -for a given route- the earliest trip leaving from a specific stop after a given time on the query day
  const routeData = routes[route];
  const routeServices = Object.keys(routeData["service_buckets"]);

  const routeActiveServices = [];
  for (let routeServiceId of routeServices) {
    if (queryDayActiveServicesMap[routeServiceId]) {
      routeActiveServices.push(routeServiceId);
    }
  }
  let earliestDepartureTime = Infinity;
  let earliestTrip = null;
  for (let routeActiveServiceId of routeActiveServices) {
    const currentStopAllDepartureTimeForCurrentService =
      routeData["service_buckets"][routeActiveServiceId][departureStopIndex];
    const serviceTrips =
      routeData["service_buckets"][routeActiveServiceId]["trip_ids"];
    // Binary search
    let lower = 0;
    let upper = currentStopAllDepartureTimeForCurrentService.length - 1;
    let resultIndex = -1;
    while (lower <= upper) {
      const mid = Math.floor((lower + upper) / 2);
      if (currentStopAllDepartureTimeForCurrentService[mid] >= arrivalTime) {
        resultIndex = mid;
        upper = mid - 1;
      } else {
        lower = mid + 1;
      }
    }
    if (
      resultIndex !== -1 &&
      currentStopAllDepartureTimeForCurrentService[resultIndex] <
        earliestDepartureTime
    ) {
      earliestDepartureTime =
        currentStopAllDepartureTimeForCurrentService[resultIndex];
      earliestTrip = serviceTrips[resultIndex];
    }
  }
  return earliestTrip;
}

function raptorEngine(
  sourceNode,
  targetNode,
  queryDate,
  departureTime,
  WALKING_SPEED_MPS = 1.11, // Average human walking pace (meters/sec)
) {
  // sourceStop & targetStop must be in their original ID format
  // departureTime must be in string format: HH:MM:SS

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

  console.log("Initializing the algorithm... ");
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

  // Convert the query date to match the mapping date id format in the activeServices object
  const queryDateId = convertDateToDateId(queryDate);
  // Fetch the array of active services for that specific day
  const activeServicesOnQueryDay = activeServices[queryDateId] || [];
  // Create a O(1) access map to check if a specific service is active on query day
  const isActiveOnQueryDay = {};
  for (
    let serviceIndex = 0;
    serviceIndex < activeServicesOnQueryDay.length;
    serviceIndex++
  ) {
    const serviceId = activeServicesOnQueryDay[serviceIndex];
    isActiveOnQueryDay[serviceId] = true;
  }
  // Return descriptive error code if no public transit services are scheduled for the queried date
  if (activeServicesOnQueryDay.length === 0) {
    return {
      targetArrivalTime: null,
      legs: [],
      errorCode: "NO_ACTIVE_SERVICES",
      error:
        "No transit services are active or scheduled for operation on the requested date.",
    };
  }

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
  // NEW: 2D matrix tracking exact walk distances in meters for footpath/origin/destination legs
  const parentWalkDistance = [];

  // Convert query departure time string into total seconds elapsed since midnight
  const departureSeconds = calculateTimeOfDayInSeconds(departureTime);

  for (let roundNumber = 0; roundNumber <= MAX_ROUNDS; roundNumber++) {
    // Pre-allocation of matrices with native fills
    parentStop[roundNumber] = new Array(stops.length).fill(null);
    parentTrip[roundNumber] = new Array(stops.length).fill(null);
    parentRoute[roundNumber] = new Array(stops.length).fill(null);
    parentWalkDistance[roundNumber] = new Array(stops.length).fill(null);
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
    console.log("Stage 1: Route Accumulation... ");

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
    console.log("Stage 2: Route Scanning... ");

    // Traverse each route
    routesServingMarkedStops.forEach((currentStop, route) => {
      // Holds the currently boarded trip ID during route traversal
      let currentTrip = null;
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
            timetables[currentTrip][nextStopIndex]["arrival"];
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
              timetables[currentTrip][nextStopIndex]["departure"]
          ) {
            currentTrip = getEarliestTrip(
              route,
              nextStopIndex,
              previousRoundArrivalTimeAtCurrentStop,
              isActiveOnQueryDay,
            );
            boardingStop = nextStop;
          }
        }
      }
    });

    // Stage 3: Footpath Processing (Lines 24-27 in the research paper)
    console.log("Stage 3: Footpath Processing... ");

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

      // If a footpath was used (tripUsed === -1), stay in the same round. If transit was used, step back one round
      const previousRound = tripUsed === -1 ? backwardRound : backwardRound - 1;

      // Find the order index of the previous stop within the route for timetable lookup
      const previousStopOrderInRoute =
        tripUsed === -1
          ? null
          : routes[routeUsed]["stop_order_map"][previousStop];

      // Fetch exact departure time from timetable for transit legs, or null for walking legs
      const exactDepartureSeconds =
        tripUsed === -1
          ? null
          : timetables[tripUsed][previousStopOrderInRoute]["departure"];

      // Get the time the user arrived at the boarding platform in the previous round
      const platformArrivalSeconds = arrivalTimes[previousRound][previousStop];

      // Construct the detailed segment (leg) object containing wait, walk, transit, and timing data
      const currentLeg = {
        waitDurationSeconds:
          tripUsed === -1 ? 0 : exactDepartureSeconds - platformArrivalSeconds,
        startTime:
          tripUsed === -1
            ? arrivalTimes[backwardRound][stopPointer] - routeUsed
            : timetables[tripUsed][previousStopOrderInRoute]["departure"],
        fromStopCode: stops[previousStop]["stop_code"],
        routeShortName:
          tripUsed === -1 ? null : routes[routeUsed]["short_name"],
        toStopCode: stops[stopPointer]["stop_code"],
        endTime: arrivalTimes[backwardRound][stopPointer],
        mode: tripUsed === -1 ? "WALK" : "TRANSIT",
        tripId: tripUsed === -1 ? null : reverseTripMapping[tripUsed],
        walkDurationSeconds: tripUsed === -1 ? routeUsed : 0,
        // Inject pre-calculated distance for footpath legs, null for transit
        walkDistanceMeters: tripUsed === -1 ? walkDistance : null,
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
        startTime: shiftedDepartureSeconds,
        fromStopCode: "ORIGIN_PIN",
        routeShortName: null,
        toStopCode: stops[stopPointer]["stop_code"],
        endTime: shiftedDepartureSeconds + initialWalkSeconds,
        mode: "WALK",
        tripId: null,
        walkDurationSeconds: initialWalkSeconds,
        walkDistanceMeters: initialWalkDistance,
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
      // Calculate destination Haversine distance with detour factor

      itineraryDetails.legs.push({
        waitDurationSeconds: 0,
        startTime: finalStationArrivalSeconds,
        fromStopCode: stops[targetStop]["stop_code"],
        routeShortName: null,
        toStopCode: "TARGET_PIN",
        endTime: finalStationArrivalSeconds + finalWalkSeconds,
        mode: "WALK",
        tripId: null,
        walkDurationSeconds: finalWalkSeconds,
        walkDistanceMeters: finalWalkDistance,
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
        previousLeg.toStopCode = currentLeg.toStopCode;
        previousLeg.endTime = currentLeg.endTime;
        previousLeg.walkDurationSeconds += currentLeg.walkDurationSeconds;
        previousLeg.walkDistanceMeters += currentLeg.walkDistanceMeters;
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
          startTime: departureSeconds,
          fromStopCode: "ORIGIN_PIN",
          routeShortName: null,
          toStopCode: "TARGET_PIN",
          endTime: directWalkingArrivalTime,
          mode: "WALK",
          tripId: null,
          walkDurationSeconds: directWalkingDuration,
          walkDistanceMeters: directRealDistance,
        },
      ],
    };
  }

  return bestItinerary;
}

// console.log(
//   raptorEngine(
//     { type: "stop", id: "4810243" },
//     { type: "stop", id: "4850204" },

//     "2026-09-13",
//     "11:59:00",
//   ),
// );

console.log(
  raptorEngine(
    { type: "coordinate", lat: 60.173766355934, lon: 24.779820890764707 },
    { type: "coordinate", lat: 60.14468173039075, lon: 24.982796872940842 },
    "2026-09-13",
    "11:05:00",
  ),
);

module.exports = raptorEngine;
