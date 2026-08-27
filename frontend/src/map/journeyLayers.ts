import type { FeatureCollection, LineString, Point } from 'geojson';
import type { Coordinates } from '../types/journey';
import { visualForFamily } from '../features/journey/modeVisuals';
import { tokenColor } from './tokenColor';
import type { OverlayLayer } from './useGeoJson';
import { lineCoordinates } from './coords';

/**
 * How a journey and a line are painted, in the one place both agree on it.
 *
 * The journey map and the line map draw the same alphabet — a coloured stroke
 * cased against the page's surface, an open ring where you can board, a small
 * dot for a stop ridden through — and they drew it twice while this was
 * Leaflet, as two sets of class names that happened to match. On a GL map the
 * paint is data rather than markup, so the two can share it outright.
 *
 * **A stroke's colour travels with the feature, not with the layer.** A layer
 * paints every feature it draws the same way, and a journey is several modes at
 * once, so the colour is resolved per segment and read back with `['get']`.
 * That also settles what used to be a real Leaflet trap: a path's `className`
 * was applied at creation and never updated, so a reused layer kept the colour
 * of the journey before it. There is no class here to go stale.
 *
 * `line-dasharray` is the one thing that cannot be data-driven, which is why
 * walking and riding are separate layers filtered apart rather than one layer
 * with an expression. The width differs between them anyway.
 */

/** What a drawn segment carries with it. */
export interface SegmentProperties {
  /** Resolved from the mode's token, because a paint property needs a value. */
  color: string;
  /**
   * Which token that colour came from.
   *
   * Carried alongside the value, not instead of it, and it is the honest half
   * of the pair: `color` is what this scheme happens to resolve to right now,
   * and `token` is the decision — a bus line is painted from `mode-bus`, which
   * is what makes it the same blue as the chip beside it in the sidebar.
   *
   * It exists because the value on its own cannot be checked. Under Leaflet
   * the class name was on the element and a test could read it; a resolved
   * `#3b6fd4` proves nothing about where it came from, and in jsdom — which
   * loads no stylesheet — every token resolves to the same fallback. So the
   * provenance travels with the feature.
   */
  token: string;
  /** Splits the dashed layer from the solid one. */
  walk: boolean;
  /** Which leg this belongs to, so a press can open the run it is riding. */
  legIndex: number;
}

export interface DrawnSegment {
  path: readonly Coordinates[];
  family: string | null;
  walk: boolean;
  legIndex: number;
}

export interface DrawnPoint {
  point: Coordinates;
  family: string | null;
  /** A call is a ring you can board at; a passed stop is a smaller dot. */
  call: boolean;
  /**
   * The stop this circle is, where pressing it opens something.
   *
   * Carried on the feature because a circle layer has no per-element handler
   * to hang an id on — a press is answered by asking the map what is under the
   * pointer, and the answer is a feature and its properties. Null where the
   * circles are decoration, as they are on a journey.
   */
  id?: string | null | undefined;
}

/**
 * Which token a family is painted from.
 *
 * Taken from the shared visual rather than rebuilt here. `text-mode-bus` is
 * the class; `mode-bus` is the token underneath it, and slicing the prefix
 * keeps `modeVisuals` the single source of that mapping.
 */
export function tokenFor(family: string | null): string {
  if (family === null) return 'content-muted';
  return visualForFamily(family).ink.replace(/^text-/, '');
}

/** The mode's own colour, or the muted ink when a segment has no mode. */
function inkFor(family: string | null): string {
  return tokenColor(tokenFor(family));
}

export function segmentCollection(
  segments: readonly DrawnSegment[],
): FeatureCollection<LineString, SegmentProperties> {
  return {
    type: 'FeatureCollection',
    features: segments.map((segment) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: lineCoordinates(segment.path) },
      properties: {
        color: inkFor(segment.family),
        token: tokenFor(segment.family),
        walk: segment.walk,
        legIndex: segment.legIndex,
      },
    })),
  };
}

export function pointCollection(
  points: readonly DrawnPoint[],
): FeatureCollection<
  Point,
  { color: string; token: string; call: boolean; id: string | null }
> {
  return {
    type: 'FeatureCollection',
    features: points.map(({ point: [lat, lon], family, call, id }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        color: inkFor(family),
        token: tokenFor(family),
        call,
        id: id ?? null,
      },
    })),
  };
}

/**
 * The four line layers, in the order they must be added.
 *
 * The casings go down first and both of them before either coloured stroke:
 * on a GL map the last layer added is on top, so a casing added after its own
 * line would paint over it. Leaflet's panes made that ordering implicit and
 * this makes it explicit, which is the better of the two.
 *
 * The casing is the page's own surface colour — what keeps a dark blue bus
 * line from disappearing into dark water, and a pale one from washing out over
 * a light map. Ordinary transit cartography, and it leaves the colour itself
 * untouched.
 */
export function lineLayers(): OverlayLayer[] {
  const surface = tokenColor('surface');

  return [
    {
      id: 'casing-ride',
      type: 'line',
      filter: ['!', ['get', 'walk']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': surface, 'line-width': 10, 'line-opacity': 0.9 },
    },
    {
      id: 'casing-walk',
      type: 'line',
      filter: ['get', 'walk'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': surface, 'line-width': 8, 'line-opacity': 0.9 },
    },
    {
      id: 'ride',
      type: 'line',
      filter: ['!', ['get', 'walk']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 6 },
    },
    {
      /*
       * A walk is a straight line the engine measured as the crow flies, so it
       * is dashed here exactly as it is in the strip map — the drawing says it
       * is an estimate. Round caps and a zero-length dash give dots rather
       * than ticks; the units are multiples of the line's own width, which is
       * why these numbers are not the pixel values Leaflet took.
       */
      id: 'walk',
      type: 'line',
      filter: ['get', 'walk'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-dasharray': [0, 2],
      },
    },
  ];
}

/**
 * The stop circles.
 *
 * A call is where you can get on or off and is drawn as an open ring; a stop
 * merely ridden through is a smaller dot. Both are filled with the page's
 * surface rather than the mode's colour, so the ring reads as a ring.
 */
export function stopCircleLayers(): OverlayLayer[] {
  const surface = tokenColor('surface');

  return [
    {
      id: 'passed',
      type: 'circle',
      filter: ['!', ['get', 'call']],
      paint: {
        'circle-radius': 3.5,
        'circle-color': surface,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'call',
      type: 'circle',
      filter: ['get', 'call'],
      paint: {
        'circle-radius': 6,
        'circle-color': surface,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 3,
      },
    },
  ];
}
