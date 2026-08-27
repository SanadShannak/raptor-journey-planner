import { env } from '../config/env';

/**
 * Where the basemap under a journey comes from.
 *
 * An adapter resolved from the network, for the same reason the geocoder is
 * one: the right answer depends on the city, so adding a city means adding an
 * entry here rather than changing the map. Nothing else in the app knows a tile
 * URL.
 *
 * The default is CARTO's Positron and Dark Matter — a matched light and dark
 * pair, deliberately desaturated. That point is the reason they are here
 * rather than a general-purpose style: they are drawn to sit *under* data, so
 * the mode colours of a route stay the loudest thing on the screen. A
 * reference basemap is a busier and more colourful map, and it competes.
 *
 * Two styles rather than one filtered style, because a filter over a light
 * basemap inverts everything drawn under it. It also cannot be undone
 * selectively: OpenStreetMap's standard style paints minor roads white on pale
 * land, which inverts to black on near-black and disappears.
 *
 * **Vector, not raster.** These are GL style documents rather than tile
 * templates: the map is handed a stylesheet and draws the roads itself from
 * geometry, instead of downloading pictures of them. Three things follow that
 * the raster map could not do. Labels are laid out against what is on the map
 * *now*, so a street name steps aside for a route line drawn over it rather
 * than sitting under one. Type stays sharp at every zoom, including the
 * fractional ones between whole levels. And changing scheme is a restyle
 * rather than a refetch.
 *
 * **Attribution is a condition of use, not decoration**, and it no longer
 * lives here. A GL style document names the sources it draws from and carries
 * their credit with it, which the attribution control renders on its own — so
 * a copy in this file printed both names twice, once from each. The raster map
 * had to supply it because a tile URL carries nothing but pixels.
 *
 * The consequence is worth stating plainly, because it is now invisible rather
 * than merely absent: **a style added here must be checked for its own
 * attribution.** One without it would ship no credit at all, and nothing would
 * fail to build.
 *
 * `VITE_CARTO_API_KEY` is optional and appended when set. CARTO reads it as
 * `key`; sending it as `api_key` is not an error, which is the trap — the CDN
 * answers 200 either way and quietly serves the "API KEY REQUIRED" watermark.
 */
export interface TileSource {
  /** GL style document for the light scheme. */
  light: string;
  dark: string;
  maxZoom: number;
}

const key = env.cartoKey === null ? '' : `?key=${encodeURIComponent(env.cartoKey)}`;

const CARTO: TileSource = {
  light: `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json${key}`,
  dark: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json${key}`,
  /*
   * Past the vector data's own deepest level, and deliberately.
   *
   * A raster map stops where the pictures stop: ask for a tile nobody drew and
   * you get nothing. Vector geometry from the deepest level keeps drawing at
   * any zoom beyond it — it is simply scaled — so the extra levels are real
   * map rather than blank.
   */
  maxZoom: 22,
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
