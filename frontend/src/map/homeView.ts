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
  hsl: { center: [60.185, 24.94], zoom: 13 },
  amman: { center: [31.955, 35.93], zoom: 13 },
};

/**
 * Falls back to the middle of whatever the network searches, which is at least
 * inside it. A network with no entry gets a usable map rather than the Atlantic.
 */
export function homeViewFor(network: string | null, bounds: GeoBounds | null): HomeView {
  const known = network === null ? undefined : HOME[network];
  if (known !== undefined) return known;
  if (bounds === null) return { center: [60.185, 24.94], zoom: 13 };

  return {
    center: [(bounds.minLat + bounds.maxLat) / 2, (bounds.minLon + bounds.maxLon) / 2],
    zoom: 11,
  };
}

/**
 * How far out the stops page still draws stops.
 *
 * Two levels further out than the journey map's own threshold. There the stops
 * are scenery over somebody's route and must not crowd it; here they are the
 * subject and nothing else is competing for the ground, so they can appear as
 * soon as they are far enough apart to tell apart.
 */
export const STOPS_MIN_ZOOM = 13;

/**
 * How far out a *line's* map still draws the network's other stops.
 *
 * Two levels closer in than the stops page. There the stops are the subject and
 * should appear as early as they can be told apart; here they are context
 * behind a drawn line, and a line framed end to end is a whole corridor — at
 * the stops page's threshold that fills with markers the reader did not ask
 * for, and the line they came for is the thing competing for attention.
 *
 * The line's own stops are drawn at every zoom regardless: they belong to the
 * subject, not to the layer underneath it.
 */
export const ROUTE_STOPS_MIN_ZOOM = STOPS_MIN_ZOOM + 2;

/**
 * The zoom the stops page opens at, wherever it is looking.
 *
 * Comfortably inside {@link STOPS_MIN_ZOOM}, so the page opens on stops rather
 * than on a city with none drawn and no hint that going closer would help —
 * and with room to pull out a good way before they go.
 */
const STOPS_ZOOM = 16;

/** The same resting place, framed close enough that stops are already drawn. */
export function stopsViewFor(network: string | null, bounds: GeoBounds | null): HomeView {
  return { center: homeViewFor(network, bounds).center, zoom: STOPS_ZOOM };
}
