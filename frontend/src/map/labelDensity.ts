import type { Map as GlMap } from 'maplibre-gl';

/**
 * The zoom at which each of the basemap's name layers starts, brought forward.
 *
 * CARTO's styles hold names back for a general-purpose map: at the zoom every
 * map here opens on (13), they show suburbs, villages and the biggest roads,
 * and a primary road's name waits for 14, a secondary's for 15, a side
 * street's for 16. That is too sparse to find your way on — a journey planner
 * is read by people deciding which stop is near which street — and the names
 * are in the tiles all along (the data runs to 15), only hidden by the style.
 *
 * About two levels earlier throughout, which at the opening view adds the
 * primary and secondary road names and the parks. Collision still decides what
 * fits: more layers *eligible* does not mean more text on top of text, because
 * a label that would overlap a placed one is simply not drawn.
 *
 * Keyed by CARTO's layer ids, so a layer CARTO renames is left alone rather
 * than broken; the maximum zoom each layer had is kept.
 */
const EARLIER_MIN_ZOOM: Record<string, number> = {
  roadname_major: 11,
  roadname_pri: 12,
  roadname_sec: 13,
  roadname_minor: 14,
  place_villages: 9,
  place_suburbs: 11,
  place_hamlet: 11,
  poi_park: 13,
  poi_stadium: 13,
};

/**
 * Applies {@link EARLIER_MIN_ZOOM} to whichever of those layers the style has,
 * and lifts the place names above the street names.
 *
 * The lift is what keeps the first half from backfiring. Labels are placed
 * from the top layer down, and CARTO stacks street names above place names, so
 * once streets are named this early they claim the space first and the
 * district names — Jabal Amman, Zahran, Al-Madina — are the ones that lose the
 * collision. Those are the names that tell you where you are, so they go first
 * and the streets fill in around them. Moved in their own order, so a city
 * still outranks a suburb.
 *
 * Run on `style.load`, before any page adds its own layers: "the top" is then
 * the top of the basemap, and routes and stops still draw over it.
 */
export function showMoreLabels(map: GlMap): void {
  for (const [id, minZoom] of Object.entries(EARLIER_MIN_ZOOM)) {
    const layer = map.getLayer(id);
    if (layer === undefined) continue;
    map.setLayerZoomRange(id, minZoom, layer.maxzoom ?? 24);
  }

  const placeLayers = map
    .getStyle()
    .layers.filter((layer) => layer.type === 'symbol' && layer.id.startsWith('place_'))
    .map((layer) => layer.id);
  for (const id of placeLayers) map.moveLayer(id);
}
