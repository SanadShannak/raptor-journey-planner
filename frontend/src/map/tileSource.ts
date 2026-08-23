/**
 * Where the basemap under a journey comes from.
 *
 * An adapter resolved from the network, for the same reason the geocoder is
 * one: the right answer depends on the city, so adding a city means adding an
 * entry here rather than changing the map. Nothing else in the app knows a tile
 * URL.
 *
 * The default is CARTO's Positron and Dark Matter — a matched light and dark
 * pair, no API key, and deliberately desaturated. That last point is the reason
 * they are here rather than a general-purpose style: they are drawn to sit
 * *under* data, so the mode colours of a route stay the loudest thing on the
 * screen. A reference basemap is a busier and more colourful map, and it
 * competes.
 *
 * Two schemes rather than one filtered scheme, because a filter over a light
 * basemap inverts everything drawn under it. It also cannot be undone
 * selectively: OpenStreetMap's standard style paints minor roads white on pale
 * land, which inverts to black on near-black and disappears.
 *
 * Attribution is a condition of use, not decoration. It is rendered by the map
 * and must stay visible.
 */
export interface TileSource {
  /** Tile template for the light scheme; `{r}` expands to `@2x` on retina. */
  light: string;
  dark: string;
  /** Shown on the map, and required by the terms of both providers. */
  attribution: string;
  maxZoom: number;
}

const CARTO: TileSource = {
  light: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxZoom: 20,
};

/**
 * Keyed by the network id `/api/network` reports, exactly as the geocoding
 * bounds are. Both cities use the same source today; the table exists so that
 * a network which needs its own — a local operator's own cartography, say —
 * can have it without touching anything that draws.
 */
const SOURCES: Record<string, TileSource> = {
  hsl: CARTO,
  amman: CARTO,
};

export function tileSourceFor(network: string | null): TileSource {
  if (network === null) return CARTO;
  return SOURCES[network] ?? CARTO;
}
