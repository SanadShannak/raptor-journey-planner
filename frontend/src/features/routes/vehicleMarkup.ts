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
 * The shape is a disc in the mode's colour with the mode's own silhouette
 * inside it, and a nose on the rim pointing the way it is travelling. Three
 * things carry the meaning rather than one: the colour says which mode, the
 * silhouette says it again for anyone who cannot see the colour, and the nose
 * is a shape rather than a hue so it survives greyscale.
 *
 * Cased against the page's surface, like every other coloured thing drawn over
 * a map here — a dark disc on dark water is otherwise a hole.
 */

/** How big the disc is drawn, in CSS pixels. */
export const VEHICLE_SIZE = 30;

/**
 * The nose, pointing due north before it is rotated.
 *
 * Only the nose turns. Rotating the whole badge would turn the silhouette with
 * it and leave a bus lying on its side halfway round a bend.
 */
const NOSE = 'M15 1.4 L19.4 8.4 H10.6 Z';

/**
 * @param family The visual family — `bus`, `tram`, … — not a raw route type.
 * @param bearing Compass degrees, 0 north and 90 east.
 */
export function vehicleMarkup(family: string, bearing: number): string {
  const ink = visualForFamily(family).ink;

  return `<svg viewBox="0 0 30 30" width="${VEHICLE_SIZE}" height="${VEHICLE_SIZE}" class="${ink}" aria-hidden="true">
  <g transform="rotate(${bearing.toFixed(1)} 15 15)">
    <path d="${NOSE}" fill="currentColor" class="stroke-surface" stroke-width="1.5" stroke-linejoin="round" />
  </g>
  <circle cx="15" cy="15" r="9.8" fill="currentColor" class="stroke-surface" stroke-width="2" />
  <svg x="8" y="8" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="text-on-mode">${modeIconMarkup(family)}</svg>
</svg>`;
}
