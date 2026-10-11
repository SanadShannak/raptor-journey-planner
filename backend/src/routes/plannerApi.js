const express = require("express");
const router = express.Router();
const AppError = require("../utils/AppError");

// Import the core RAPTOR engine
const raptorEngine = require("../../raptor-engines/raptorEngine");

// Import the input validators and formatters
const {
  isValidDate,
  isValidTime,
  isValidWalkingSpeed,
} = require("../utils/inputValidator");
const formatItinerary = require("../utils/formatItinerary");
const logCalculationTime = require("../utils/logCalculationTime");

// Main RAPTOR routing endpoint
router.get("/", (req, res) => {
  // Extract RAPTOR engine arguments
  const {
    originLat,
    originLon,
    originStopId,
    destLat,
    destLon,
    destStopId,
    date,
    time,
    WALKING_SPEED_MPS,
  } = req.query;

  // Construct source node
  let sourceNode;
  // If source node is a pinpoint (coordinate)
  if (originLat && originLon) {
    sourceNode = {
      type: "coordinate",
      lat: parseFloat(originLat),
      lon: parseFloat(originLon),
    };
  }
  // If source node is a known stop
  else if (originStopId) {
    sourceNode = { type: "stop", id: originStopId };
  } else {
    // Missing/Bad source node parameters
    throw new AppError(400, "MISSING_ORIGIN", "Must provide either origin coordinates (`originLat`, `originLon`) or `originStopId`.");
  }

  // Construct target node
  let targetNode;
  // If target node is a pinpoint (coordinate)
  if (destLat && destLon) {
    targetNode = {
      type: "coordinate",
      lat: parseFloat(destLat),
      lon: parseFloat(destLon),
    };
  }
  // If target node is a known stop
  else if (destStopId) {
    targetNode = { type: "stop", id: destStopId };
  } else {
    // Missing/Bad target node parameters
    throw new AppError(400, "MISSING_DESTINATION", "Must provide either destination coordinates (`destLat`, `destLon`) or `destStopId`.");
  }
  // If date is not provided or in wrong format
  if (!date || !isValidDate(date)) {
    throw new AppError(400, "BAD_DATE", "Must provide `date` argument in the format 'YYYY-MM-DD'");
  }
  // If time is not provided or in wrong format
  if (!time || !isValidTime(time)) {
    throw new AppError(400, "BAD_TIME", "Must provide `time` argument in the format 'HH:MM:SS'");
  }
  // Check if the optional WALKING_SPEED_MPS is provided and in is a positive number
  // Extract optional walking speed parameter
  const parsedSpeed = parseFloat(WALKING_SPEED_MPS);
  const walkingSpeed = isValidWalkingSpeed(parsedSpeed)
    ? parsedSpeed
    : undefined;
  // Engine execution time tracking
  const raptorExecStartTime = performance.now();
  // Execute RAPTOR engine to find itinerary
  const rawItinerary = raptorEngine(
    sourceNode,
    targetNode,
    date,
    time,
    walkingSpeed, // OPTIONAL, if not provided evaluates to undefined and RAPTOR falls back to default value
  );
  logCalculationTime("Route", raptorExecStartTime);

  // If RAPTOR returned an internal error, return error object
  if (rawItinerary.errorCode) {
    return res.json(rawItinerary);
  }

  // Format the successful itinerary
  const itinerary = formatItinerary(rawItinerary);
  // Return the final formatted payload
  res.json(itinerary);
});

module.exports = router;

/* example usage:
http://localhost:3000/api/planner?originLat=60.20507633764775&originLon=24.962304855335976&destLat=60.14540472&destLon=24.987795623893412&date=2026-09-13&time=18:00:00
*/
