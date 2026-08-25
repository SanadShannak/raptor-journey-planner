import { modeIconMarkup } from '../journey/modeIconMarkup';
import { visualForFamily } from '../journey/modeVisuals';

/**
 * A vehicle on the line: what it is, and which way it is going.
 *
 * Markup rather than JSX because it has two renderers and they must not drift.
 * The sidebar draws these down the spine and the map draws them on the road,
 * and Leaflet builds a marker from an HTML string and never from a React tree —
 * the same bargain {@link modeIconMarkup} already makes for the silhouettes.
 *
 * A rounded square — the stops are circles, and shape is the distinction that
 * survives everything a colour does not: greyscale, colour blindness, a small
 * screen, a crowded stretch of line where a vehicle sits right on top of the
 * stop it is calling at. Two circles of different sizes are the same sign
 * twice.
 *
 * In the mode's colour with the mode's own silhouette inside,
 * and an arrowhead on the leading edge pointing the way it is travelling. Every
 * part of that is doing a job: the square tells a vehicle from the circles the
 * stops are drawn as, the colour says which mode, the silhouette says it again
 * for anyone who cannot see the colour, and the arrow is a shape rather than a
 * hue so the direction survives greyscale too.
 *
 * Cased against the page's surface, like every other coloured thing drawn over
 * a map here — a dark disc on dark water is otherwise a hole.
 */

/**
 * How big the badge is drawn, in CSS pixels.
 *
 * Deliberately larger than anything else on the spine or the map. A vehicle is
 * the one thing here that *moves*, and at the size of a stop marker it read as
 * one more dot in a column of dots — the movement was the only thing telling
 * them apart, and movement is exactly what a glance does not catch.
 */
export const VEHICLE_SIZE = 42;

/**
 * The arrow, pointing due north before it is rotated.
 *
 * A dart rather than a plain triangle — the notch in its back is what makes it
 * read as an arrowhead rather than as a roof on the badge. Its notch sits
 * exactly on the badge's top edge, so the two are one sign rather than a shape
 * with a hat.
 *
 * Only the arrow turns. Rotating the whole badge would turn the silhouette with
 * it and leave a bus lying on its side halfway round a bend.
 */
const ARROW = 'M21 0.8 L30.8 12.4 L21 8.6 L11.2 12.4 Z';

/**
 * @param family The visual family — `bus`, `tram`, … — not a raw route type.
 * @param bearing Compass degrees, 0 north and 90 east. Down a list is 180; on a
 *   map it is the heading of the stretch of shape the vehicle is on.
 */
export function vehicleMarkup(family: string, bearing: number): string {
  const ink = visualForFamily(family).ink;

  /*
   * `route-vehicle` is a hook, not a style — nothing in the stylesheet matches
   * it. It is what lets one selector find a vehicle whether it was drawn into
   * the sidebar by React or into the map by Leaflet, which is the only way to
   * assert that the two renderers agree.
   */
  return `<svg viewBox="0 0 42 42" width="${VEHICLE_SIZE}" height="${VEHICLE_SIZE}" class="route-vehicle ${ink}" aria-hidden="true">
  <g transform="rotate(${bearing.toFixed(1)} 21 21)">
    <path d="${ARROW}" fill="currentColor" class="stroke-surface" stroke-width="2" stroke-linejoin="round" />
  </g>
  <rect x="8" y="8" width="26" height="26" rx="8" fill="currentColor" class="stroke-surface" stroke-width="2.5" />
  <svg x="12.5" y="12.5" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="text-on-mode">${modeIconMarkup(family)}</svg>
</svg>`;
}
