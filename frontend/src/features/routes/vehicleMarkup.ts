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
 * A pin with a beating halo: a soft disc that pulses outward, a pale body, a
 * core in the mode's colour carrying the mode's own silhouette, and a tail on
 * the leading edge pointing the way it is travelling.
 *
 * Every part is doing a job. The halo says *this one is moving* — it is the
 * only animated thing on either surface, so a vehicle is findable among forty
 * stops without reading any of them. The tail is a shape rather than a hue, so
 * the direction survives greyscale. And the silhouette stays inside the core
 * rather than being replaced by a plain dot: mode is never carried by colour
 * alone here, and a dot on a map is a stop.
 *
 * The halo also does the job the old outline was doing badly. A ring the colour
 * of the page vanishes over a map — light cartography is very nearly `surface`
 * in the light scheme and dark cartography very nearly `surface` in the dark —
 * whereas a translucent disc of the mode's own colour reads against both,
 * because it is neither.
 *
 * Cased against the page's surface, like every other coloured thing drawn over
 * a map here — a dark disc on dark water is otherwise a hole.
 */

/**
 * How big the badge is drawn, in CSS pixels.
 *
 * The halo is most of it. The body inside is about the size the badge has
 * always been; what has grown is the space it beats into, which is transparent
 * and so costs nothing it overlaps.
 */
export const VEHICLE_SIZE = 64;

/**
 * The tail, pointing due north before it is rotated.
 *
 * Its base sits *inside* the body, so the two fuse into one pin rather than
 * reading as a circle with a triangle balanced on it. Only the tail turns:
 * rotating the whole badge would turn the silhouette with it and leave a bus
 * lying on its side halfway round a bend.
 */
const TAIL = 'M32 5 L41 21 L23 21 Z';

/**
 * @param family The visual family — `bus`, `tram`, … — not a raw route type.
 * @param bearing Compass degrees, 0 north and 90 east. Down a list is 180; on a
 *   map it is the heading of the stretch of shape the vehicle is on.
 */
export function vehicleMarkup(family: string, bearing: number): string {
  const ink = visualForFamily(family).ink;

  return `<svg viewBox="0 0 64 64" width="${VEHICLE_SIZE}" height="${VEHICLE_SIZE}" class="route-vehicle ${ink}" aria-hidden="true">
  <circle class="vehicle-halo" cx="32" cy="32" r="26" fill="currentColor" />
  <g transform="rotate(${bearing.toFixed(1)} 32 32)">
    <path d="${TAIL}" fill="currentColor" />
  </g>
  <circle cx="32" cy="32" r="16" class="fill-surface" />
  <circle cx="32" cy="32" r="12.5" fill="currentColor" />
  <svg x="24.5" y="24.5" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="text-on-mode">${modeIconMarkup(family)}</svg>
</svg>`;
}
