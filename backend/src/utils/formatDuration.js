function formatDuration(totalSeconds) {
  if (totalSeconds === null) {
    return null;
  }
  // Return 0 if there is no duration at all
  if (totalSeconds === 0) {
    return 0;
  }
  // Return rounded total minutes
  const roundedMinutes = Math.round(totalSeconds / 60);
  // if seconds round to 0, fallback to 1
  return roundedMinutes === 0 ? 1 : roundedMinutes;
}

module.exports = formatDuration;
