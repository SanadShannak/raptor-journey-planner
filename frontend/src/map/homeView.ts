import type { GeoBounds } from '../config/geocoding';

/**
 * Where the map rests when there is no journey to show.
 *
 * Deliberately not the geocoding bounds. Those exist to keep a place search
 * inside the network and are generous on purpose — HSL's reach as far as
 * Riihimäki, an hour of commuter rail north of the city. Framing the map to
 * that box opens it on a region, where the city is a smudge and none of it is
 * a place you could point at.
 *
 * A view rather than a box, for the same reason: fitting a box means the frame
 * is decided by the corners furthest apart, and what is wanted here is simply
 * where to look and how close.
 *
 * Keyed by the network id `/api/network` reports, exactly as the bounds and the
 * tiles are, so a new city is a line here rather than a change to the map.
 */
export interface HomeView {
  center: [latitude: number, longitude: number];
  zoom: number;
}

/** The city and its inner suburbs — close enough to read, wide enough to place. */
const HOME: Record<string, HomeView> = {
  hsl: { center: [60.185, 24.94], zoom: 12 },
  amman: { center: [31.955, 35.93], zoom: 12 },
};

/**
 * Falls back to the middle of whatever the network searches, which is at least
 * inside it. A network with no entry gets a usable map rather than the Atlantic.
 */
export function homeViewFor(network: string | null, bounds: GeoBounds | null): HomeView {
  const known = network === null ? undefined : HOME[network];
  if (known !== undefined) return known;
  if (bounds === null) return { center: [60.185, 24.94], zoom: 12 };

  return {
    center: [(bounds.minLat + bounds.maxLat) / 2, (bounds.minLon + bounds.maxLon) / 2],
    zoom: 11,
  };
}
