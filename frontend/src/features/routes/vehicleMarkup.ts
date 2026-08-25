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
export const VEHICLE_SIZE = 56;

/**
 * The arrow, pointing due north before it is rotated.
 *
 * A dart, and it **overlaps the badge rather than standing off it**. Detached
 * it read as two signs — a square, and a separate triangle floating above it —
 * and which square the triangle belonged to was a guess on a crowded stretch of
 * line. Its wings and its notch all sit inside the badge's top edge, so the two
 * fuse into one filled shape with a point on it.
 *
 * Only the arrow turns. Rotating the whole badge would turn the silhouette with
 * it and leave a bus lying on its side halfway round a bend.
 */
const ARROW = 'M28 3 L39.5 19 L28 15.5 L16.5 19 Z';

/** The badge, as attributes rather than a path, so the corners stay rounded. */
const BADGE = 'x="16" y="16" width="24" height="24" rx="7.5"';

/**
 * @param family The visual family — `bus`, `tram`, … — not a raw route type.
 * @param bearing Compass degrees, 0 north and 90 east. Down a list is 180; on a
 *   map it is the heading of the stretch of shape the vehicle is on.
 */
export function vehicleMarkup(family: string, bearing: number): string {
  const ink = visualForFamily(family).ink;
  const turn = `rotate(${bearing.toFixed(1)} 28 28)`;

  /*
   * Outlined by drawing everything twice: once thickly in the outline colour,
   * once filled on top. A stroke on each shape separately would draw a seam
   * straight across the join where the arrow meets the badge — the two overlap,
   * and each one's outline runs through the other. Painted behind the fills,
   * only the half of the stroke that lies outside the union ever shows, which
   * is an outline around the whole sign and nothing across its middle.
   */
  return `<svg viewBox="0 0 56 56" width="${VEHICLE_SIZE}" height="${VEHICLE_SIZE}" class="route-vehicle ${ink}" aria-hidden="true">
  <g fill="none" class="stroke-brand-500" stroke-width="5" stroke-linejoin="round">
    <g transform="${turn}"><path d="${ARROW}" /></g>
    <rect ${BADGE} />
  </g>
  <g transform="${turn}"><path d="${ARROW}" fill="currentColor" /></g>
  <rect ${BADGE} fill="currentColor" />
  <svg x="21" y="21" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="text-on-mode">${modeIconMarkup(family)}</svg>
</svg>`;
}
