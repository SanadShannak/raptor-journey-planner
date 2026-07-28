function convertSecondsToTimeOfDay(totalSeconds, roundMode = "floor") {
  // roundMode can be "floor" (for safe departures) or "ceil" (for safe arrivals)
  let adjustedSeconds = totalSeconds;

  if (roundMode === "ceil") {
    // Round up to the next minute if there are leftover seconds
    adjustedSeconds = Math.ceil(totalSeconds / 60) * 60;
  } else {
    // Round down (default floor)
    adjustedSeconds = Math.floor(totalSeconds / 60) * 60;
  }

  const hours = Math.floor(adjustedSeconds / 3600) % 24; // Handle day rollovers safely
  const minutes = Math.floor((adjustedSeconds % 3600) / 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

module.exports = convertSecondsToTimeOfDay;
