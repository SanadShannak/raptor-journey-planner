/**
 * The two ends of a journey, as markup both renderers can read.
 *
 * React draws them in the form and the strip map; the map needs the same
 * shapes as raw markup, because Leaflet builds a custom marker from an HTML
 * string and never from a React tree. Kept here rather than beside the
 * components so that neither copy can drift, and so a module of components
 * stays a module of components.
 *
 * The `hole` argument is the surface the marker is sitting on, as a Tailwind
 * `fill-*` class. Both shapes are cut out rather than shaded, so the gap has
 * to be painted in whatever is behind it: a card is `surface-raised`, a field
 * is `surface`, and in dark mode those are genuinely different colours.
 */

/** The pin's outline. */
export const DESTINATION_PIN_PATH =
  'M12 21.5s6.5-6 6.5-10.5a6.5 6.5 0 10-13 0c0 4.5 6.5 10.5 6.5 10.5z';

/**
 * Where you start, as three rings.
 *
 * A single ring is what every stop on the map already is, drawn in its own
 * line's colour — so an origin drawn that way is a stop, and was read as one.
 * A target instead: solid body, a gap, and a core. It keeps the green, which
 * is the colour this app has always started journeys in, and stops competing
 * with the tram line that shares it, because no stop is ever drawn with a
 * centre.
 */
export function originMarkerMarkup(hole: string): string {
  return `
    <circle cx="12" cy="12" r="9" fill="currentColor" />
    <circle cx="12" cy="12" r="5.4" class="${hole}" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" />
  `;
}

/** The pin, with its centre cut out. */
export function destinationMarkerMarkup(hole: string): string {
  return `
    <path d="${DESTINATION_PIN_PATH}" fill="currentColor" />
    <circle cx="12" cy="10.7" r="2.4" class="${hole}" />
  `;
}
