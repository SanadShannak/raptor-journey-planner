function calculateTotalDurationFromStartToEnd(startTimeStr, endTimeStr) {
  // startTimeStr & endTimeStr format: "HH:MM"
  const [startHour, startMin] = startTimeStr.split(":").map(Number);
  const [endHour, endMin] = endTimeStr.split(":").map(Number);

  let startTotalMins = startHour * 60 + startMin;
  let endTotalMins = endHour * 60 + endMin;

  // Handle overnight crossover (e.g., starts at 23:50, ends at 00:15)
  if (endTotalMins < startTotalMins) {
    endTotalMins += 24 * 60; // Add 1440 minutes for the new day
  }

  return endTotalMins - startTotalMins; // Returns total duration in minutes
}

module.exports = calculateTotalDurationFromStartToEnd;
