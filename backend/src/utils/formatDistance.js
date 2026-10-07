function formatDistance(meters) {
  if (meters === 0) return 0;
  // return distance in meters rounded to the nearest 50
  const roundedMeters = Math.round(meters / 50) * 50;
  return roundedMeters === 0 ? 50 : roundedMeters;
}

module.exports = formatDistance;
