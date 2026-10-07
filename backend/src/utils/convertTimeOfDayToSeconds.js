function convertTimeOfDayToSeconds(timeStr) {
  if (!timeStr) return 0;

  const parts = timeStr.split(":");
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;

  return hours * 3600 + minutes * 60 + seconds;
}

module.exports = convertTimeOfDayToSeconds;
