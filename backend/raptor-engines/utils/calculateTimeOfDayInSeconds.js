function calculateTimeOfDayInSeconds(timestamp) {
  // Converts a 24-hour time string into total seconds of the day.
  return timestamp
    .split(":")
    .reduce((acc, time) => acc * 60 + parseInt(time), 0);
}

module.exports = calculateTimeOfDayInSeconds;
