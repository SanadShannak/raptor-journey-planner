function calculateTimeOfDayInSeconds(timestamp) {
  // Converts a 24-hour time string (HH:MM or HH:MM:SS) into total seconds of the day.
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 3600 + parts[1] * 60;
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

module.exports = calculateTimeOfDayInSeconds;
