function calculateHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  // Convert degrees to radius
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  // Calculate the square of half the chord length (a)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  // Calculate the angular distance in radians (c)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // Calculate distance in meters (d)
  const d = R * c;

  return d;
}

module.exports = calculateHaversine;
