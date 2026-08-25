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
export const VEHICLE_SIZE = 48;

/**
 * The arrow, pointing due north before it is rotated.
 *
 * A dart rather than a plain triangle — the notch in its back is what makes it
 * read as an arrowhead rather than as a roof on the badge.
 *
 * **It stands clear of the badge rather than touching it.** Overlapping, most
 * of the arrow was inside the square and the same colour as it, so what showed
 * was a small bump on one edge — the direction was something you could work out
 * rather than something the sign told you. Detached, with a gap the surface
 * colour shows through, it is unmistakably an arrow pointing somewhere.
 *
 * Only the arrow turns. Rotating the whole badge would turn the silhouette with
 * it and leave a bus lying on its side halfway round a bend.
 */
const ARROW = 'M24 0.5 L35.5 12 L24 7.5 L12.5 12 Z';

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
  /*
   * The arrow turns about the badge's centre, so its tip traces a circle of
   * radius 23.5 — just inside the 24 the frame allows. Any further out and it
   * would be clipped at the diagonals and nowhere else, which reads as the
   * arrow shrinking on bends.
   */
  return `<svg viewBox="0 0 48 48" width="${VEHICLE_SIZE}" height="${VEHICLE_SIZE}" class="route-vehicle ${ink}" aria-hidden="true">
  <g transform="rotate(${bearing.toFixed(1)} 24 24)">
    <path d="${ARROW}" fill="currentColor" class="stroke-border-strong" stroke-width="2.5" stroke-linejoin="round" />
  </g>
  <rect x="13" y="13" width="22" height="22" rx="7" fill="currentColor" class="stroke-border-strong" stroke-width="2.5" />
  <svg x="17" y="17" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="text-on-mode">${modeIconMarkup(family)}</svg>
</svg>`;
}
