function calculateSecondsToTimeOfDay(totalSeconds) {
  // Converts total seconds of day into 24-hour time string (HH:MM)

  // Calculate hours and minutes
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  // Format with leading zeros to match HH:MM
  const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  return formattedTime;
}

module.exports = calculateSecondsToTimeOfDay;
