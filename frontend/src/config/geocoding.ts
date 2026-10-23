import { DEFAULT_NETWORK } from './network';

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
  // All of Jordan: the Amman Bus feed also carries the intercity lines to
  // Irbid, Zarqa, Karak, Tafila, Ma'an and Aqaba.
  amman: { minLat: 29.18, minLon: 34.95, maxLat: 33.38, maxLon: 39.31 },
};

export function boundsForNetwork(network: string | null): GeoBounds | null {
  return BOUNDS[network ?? DEFAULT_NETWORK] ?? null;
}

/**
 * The countries each network's place search may answer from, as ISO 3166-1
 * alpha-2 codes.
 *
 * A box alone cannot say "Jordan": any rectangle around it takes in Jerusalem,
 * Eilat, Daraa and Tabuk, and a search for a name shared across the border —
 * which in Arabic is most of them — then offers the wrong country first. The
 * box narrows the search; this decides what is kept.
 *
 * A network with no entry is not filtered.
 */
const COUNTRIES: Record<string, readonly string[]> = {
  hsl: ['FI'],
  amman: ['JO'],
};

export function countriesForNetwork(
  network: string | null,
): readonly string[] | null {
  return COUNTRIES[network ?? DEFAULT_NETWORK] ?? null;
}
