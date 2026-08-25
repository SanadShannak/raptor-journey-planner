import { visualForFamily } from '../journey/modeVisuals';

/**
 * A vehicle on the line: what it is, and which way it is going.
 *
 * Markup rather than JSX because it has two renderers and they must not drift.
 * The sidebar draws these down the spine and the map draws them on the road,
 * and Leaflet builds a marker from an HTML string and never from a React tree —
 * the same bargain the mode silhouettes already make in `modeIconMarkup`.
 *
 * A pin with a beating halo: a soft disc that pulses outward, a pale body, a
 * core in the mode's colour carrying the line's own designation, and a tail on
 * the leading edge pointing the way it is travelling.
 *
 * Every part is doing a job. The halo says *this one is moving* — it is the
 * only animated thing on either surface, so a vehicle is findable among forty
 * stops without reading any of them. The tail is a shape rather than a hue, so
 * the direction survives greyscale.
 *
 * The core carries the **designation** rather than the mode's silhouette, and
 * that is a trade worth naming. A silhouette says "a tram"; on a line's own
 * page every vehicle is a tram, and the useful question on a map showing
 * several lines at once is *which* one. The mode is still in the colour, and
 * the number is not a colour — so nothing here rests on hue alone.
 *
 * The halo also does part of the job the old outline was doing badly. A ring
 * the colour of the page vanishes over a map — light cartography is very nearly
 * `surface` in the light scheme and dark cartography very nearly `surface` in
 * the dark — whereas a translucent disc of the mode's own colour reads against
 * both, because it is neither.
 *
 * The pin still needs an edge, and it is `content`: the page's ink, which is
 * dark on a light scheme and light on a dark one, and therefore the opposite of
 * the cartography underneath it either way. That is the one relationship that
 * holds in both schemes. The tail needed it most — a small mode-coloured
 * triangle over tiles of a similar tone simply was not there.
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
 * rotating the whole badge would turn the designation with it and leave a line
 * number upside down halfway round a bend.
 */
const TAIL = 'M32 5 L41 21 L23 21 Z';

/** How wide the designation may be inside the core, in user units. */
const LABEL_WIDTH = 20;

/**
 * A designation is one to five characters and has to fit all of them.
 *
 * The size is chosen from the length and `textLength` then holds it to the
 * width regardless — so "996K" is squeezed rather than allowed to overflow the
 * disc, and a designation nobody has anticipated cannot break the badge. The
 * size still drops with length, because letting `textLength` do all the work
 * turns five characters into five slivers.
 */
function labelSize(designation: string): number {
  if (designation.length <= 2) return 17;
  if (designation.length === 3) return 14;
  if (designation.length === 4) return 12;
  return 10;
}

/** Markup is assembled by hand here, so a designation is data until it is not. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param family The visual family — `bus`, `tram`, … — not a raw route type.
 * @param bearing Compass degrees, 0 north and 90 east. Down a list is 180; on a
 *   map it is the heading of the stretch of shape the vehicle is on.
 * @param designation The line's short name, as printed on the vehicle.
 */
export function vehicleMarkup(
  family: string,
  bearing: number,
  designation: string,
): string {
  const ink = visualForFamily(family).ink;
  const turn = `rotate(${bearing.toFixed(1)} 32 32)`;
  const label = escapeText(designation);

  /*
   * The pin is outlined by drawing it twice — thickly in the outline colour,
   * then filled on top. Stroking the tail and the body separately would draw a
   * seam straight across the join where the two overlap; painted behind the
   * fills, only the half of the stroke lying outside the union ever shows.
   *
   * Two halos rather than one, half a beat apart: a single ring spends most of
   * its cycle invisible, which on a map reads as a badge that occasionally
   * flickers rather than one that is pulsing.
   */
  return `<svg viewBox="0 0 64 64" width="${VEHICLE_SIZE}" height="${VEHICLE_SIZE}" class="route-vehicle ${ink}" aria-hidden="true">
  <circle class="vehicle-halo" cx="32" cy="32" r="28" fill="currentColor" />
  <circle class="vehicle-halo vehicle-halo-late" cx="32" cy="32" r="28" fill="currentColor" />
  <circle class="vehicle-halo-steady" cx="32" cy="32" r="21" fill="currentColor" />
  <g fill="none" class="stroke-content" stroke-width="4" stroke-linejoin="round" opacity="0.9">
    <g transform="${turn}"><path d="${TAIL}" /></g>
    <circle cx="32" cy="32" r="16" />
  </g>
  <g transform="${turn}">
    <path d="${TAIL}" fill="currentColor" />
  </g>
  <circle cx="32" cy="32" r="16" class="fill-surface" />
  <circle cx="32" cy="32" r="12.5" fill="currentColor" />
  <text x="32" y="32" dy="0.36em" text-anchor="middle" textLength="${LABEL_WIDTH}" lengthAdjust="spacingAndGlyphs" font-size="${labelSize(designation)}" font-weight="700" class="fill-on-mode">${label}</text>
</svg>`;
}
