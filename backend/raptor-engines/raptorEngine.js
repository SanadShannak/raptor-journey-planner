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
const calculateSecondsToTimeOfDay = require("./utils/calculateSecondsToTimeOfDay");
const MAX_ROUNDS = 5;

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
  sourceStop,
  targetStop,
  queryDate,
  departureTime,
  WALKING_SPEED_MPS = 1.28, // Average human walking pace (meters/sec)
) {
  // sourceStop & targetStop must be in their original ID format
  // departureTime must be in string format: HH:MM:SS

  // Safety Check: Make sure both stops exist
  if (
    !Object.hasOwn(stopMapping, sourceStop) ||
    !Object.hasOwn(stopMapping, targetStop)
  ) {
    console.error("Source Stop or Target Stop Not Found.");
    process.exit(1);
  }
  console.log("RAPTOR ENGINE RUNNING.");

  // Edge Case: Source Stop & Target are the same
  if (sourceStop === targetStop) {
    return { targetArrivalTime: departureTime, legs: [] };
  }

  // Initialization of the algorithm (Lines 1-5 in the research paper)

  console.log("Initializing the algorithm... ");
  const arrivalTimes = [];
  const markedStops = new Set();
  for (let roundNumber = 0; roundNumber <= MAX_ROUNDS; roundNumber++) {
    // Pre-allocation of the 2D arrival matrix with native Infinity fills
    arrivalTimes[roundNumber] = new Array(stops.length).fill(Infinity);
  }
  // Filling the best arrival times matrix with native Infinity fills
  const bestArrivalTimes = new Array(stops.length).fill(Infinity);

  // Mapping the source and target stop id to its index in the flat array
  const sourceStopIndex = stopMapping[sourceStop];
  const targetStopIndex = stopMapping[targetStop];
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
  // Setting the arrival time & best arrival time of the source stop to the provided departure time
  const departureSeconds = calculateTimeOfDayInSeconds(departureTime);
  arrivalTimes[0][sourceStopIndex] = departureSeconds;
  bestArrivalTimes[sourceStopIndex] = departureSeconds;
  // Adding the source stop to the 'marked' stops set to begin traversing
  markedStops.add(sourceStopIndex);

  // Path reconstruction matrices
  const parentStop = [];
  const parentTrip = [];
  const parentRoute = [];
  for (let roundNumber = 0; roundNumber <= MAX_ROUNDS; roundNumber++) {
    // Pre-allocation of the 2D arrival matrix with native Infinity fills
    parentStop[roundNumber] = new Array(stops.length).fill(null);
    parentTrip[roundNumber] = new Array(stops.length).fill(null);
    parentRoute[roundNumber] = new Array(stops.length).fill(null);
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
      let currentTrip = null;
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
            Math.min(
              bestArrivalTimes[nextStop],
              bestArrivalTimes[targetStopIndex],
            )
          ) {
            arrivalTimes[currentRound][nextStop] =
              currentTripArrivalTimeAtCurrentStop;
            bestArrivalTimes[nextStop] = currentTripArrivalTimeAtCurrentStop;
            // Set the parent stop & trip (For path reconstruction)
            parentStop[currentRound][nextStop] = boardingStop;
            parentTrip[currentRound][nextStop] = currentTrip;
            parentRoute[currentRound][nextStop] = route;
            // Mark the stop if it its arrival times were updated
            markedStops.add(nextStop);
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
            bestArrivalTimes[targetStopIndex],
          )
        ) {
          arrivalTimes[currentRound][footpathNextStop] = footpathArrivalTime;
          bestArrivalTimes[footpathNextStop] = footpathArrivalTime;
          // Set the parent stop & trip (For path reconstruction)
          parentStop[currentRound][footpathNextStop] = currentStop;
          parentTrip[currentRound][footpathNextStop] = -1;
          parentRoute[currentRound][footpathNextStop] =
            footpathDuration + footpathStationPenalty;

          // Mark the newly updated stop to process next round
          markedStops.add(footpathNextStop);
        }
      });
    });
    // Stopping Criterion: If no stops are marked, STOP.
    if (markedStops.size === 0) {
      break;
    }
  }

  // If the target stop was never reached, return null to indicate no route exists
  if (bestArrivalTimes[targetStopIndex] === Infinity) {
    return null;
  }

  // Find the minimum number of rounds (transfers) required to achieve the best arrival time
  let bestRound = 0;
  while (
    arrivalTimes[bestRound][targetStopIndex] !==
    bestArrivalTimes[targetStopIndex]
  ) {
    bestRound++;
  }

  // Initialize the final itinerary object to be returned to the API layer
  const itineraryDetails = {
    targetArrivalTime: calculateSecondsToTimeOfDay(
      bestArrivalTimes[targetStopIndex],
    ),
    legs: [],
  };

  // Traverse backwards from the target stop to the source stop to reconstruct the path
  let stopPointer = targetStopIndex;
  let backwardRound = bestRound;

  while (stopPointer !== sourceStopIndex) {
    const tripUsed = parentTrip[backwardRound][stopPointer];
    const previousStop = parentStop[backwardRound][stopPointer];
    const routeUsed = parentRoute[backwardRound][stopPointer];

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
      routeShortName: tripUsed === -1 ? null : routes[routeUsed]["short_name"],
      toStopCode: stops[stopPointer]["stop_code"],
      endTime: arrivalTimes[backwardRound][stopPointer],
      mode: tripUsed === -1 ? "WALK" : "TRANSIT",
      tripId: tripUsed === -1 ? null : reverseTripMapping[tripUsed],
      walkDurationSeconds: tripUsed === -1 ? routeUsed : null,
    };

    itineraryDetails.legs.push(currentLeg);

    // Shift pointers backwards for the next iteration of the loop
    stopPointer = previousStop;
    backwardRound = previousRound;
  }

  // Reverse the legs array since we built it from target to source
  itineraryDetails.legs.reverse();

  // Zero out the wait time for the very first leg, as the user is just departing from their origin
  if (itineraryDetails.legs.length > 0) {
    itineraryDetails.legs[0].waitDurationSeconds = 0;
  }

  return itineraryDetails;
}

console.log(raptorEngine("1173433", "2642205", "2026-09-13", "22:10:00"));

module.exports = raptorEngine;
