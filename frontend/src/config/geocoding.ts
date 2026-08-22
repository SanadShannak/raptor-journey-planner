/**
 * Where each network's place search should look.
 *
 * Without a bias a geocoder searches the world, and the nearest match to
 * "Pasila" turns out to be a café six hundred kilometres north of the
 * Helsinki district of that name. A journey planner only ever wants places its
 * network can reach.
 *
 * Kept as client configuration rather than fetched, because it is a search
 * preference rather than a fact about the timetable — and because a rough box
 * is enough. It is keyed by the network id `/api/network` reports, so adding a
 * city means adding a line here, not changing the search.
 *
 * A network with no entry searches unbiased, which is worse but never broken.
 */
export interface GeoBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

const BOUNDS: Record<string, GeoBounds> = {
  // Greater Helsinki, generous enough to include the commuter rail towns the
  // HSL feed reaches — Siuntio in the west, Riihimäki in the north.
  hsl: { minLat: 59.9, minLon: 24.0, maxLat: 60.9, maxLon: 25.7 },
  // Greater Amman.
  amman: { minLat: 31.6, minLon: 35.6, maxLat: 32.2, maxLon: 36.2 },
};

export function boundsForNetwork(network: string | null): GeoBounds | null {
  if (network === null) return null;
  return BOUNDS[network] ?? null;
}
