function normalizeRouteType(rawType) {
  // Convert string to integer just in case your CSV parser kept it as a string
  const type = parseInt(rawType, 10);

  // If it's already a standard type (0-7), just return it
  if (type >= 0 && type <= 7) {
    return type;
  }

  // Map the extended 3-digit (or 4-digit) HVT codes down to standard types
  if (type >= 100 && type < 200) return 2; // Train/Rail
  if (type >= 400 && type < 500) return 1; // Subway/Metro
  if (type >= 700 && type < 800) return 3; // Bus
  if (type >= 900 && type < 1000) return 0; // Tram
  if ((type >= 1000 && type < 1100) || type == 1200) return 4; // Ferry

  // Fallback for anything completely unknown (default to Bus)
  return 3;
}

module.exports = normalizeRouteType;
