const roundSecondsToMinute = require("./roundSecondsToMinute");

/*
 * Seconds from the engine into the "HH:MM" a client displays.
 *
 * The rounding itself lives in `roundSecondsToMinute`, because the durations
 * published alongside these strings have to be measured from exactly the same
 * rounded values. Rounding a time here and a duration somewhere else from raw
 * seconds is what let a response contradict itself.
 */
function convertSecondsToTimeOfDay(totalSeconds, roundMode = "floor") {
  // roundMode can be "floor" (for safe departures) or "ceil" (for safe arrivals)
  const adjustedSeconds = roundSecondsToMinute(totalSeconds, roundMode);

  const hours = Math.floor(adjustedSeconds / 3600) % 24; // Handle day rollovers safely
  const minutes = Math.floor((adjustedSeconds % 3600) / 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

module.exports = convertSecondsToTimeOfDay;
