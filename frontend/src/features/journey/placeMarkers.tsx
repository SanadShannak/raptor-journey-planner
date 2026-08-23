/**
 * The two ends of a journey, drawn the same way wherever they appear.
 *
 * A solid disc where you start, a pin where you finish. Both in the brand
 * colour, because both are *the traveller's own* points rather than anything
 * the network published — which is the distinction that has to survive: on a
 * map they sit among stop markers, and those are drawn as thin rings in their
 * line's colour.
 *
 * The origin used to be exactly that, a thin ring in the tram green, and on a
 * map it was indistinguishable from a tram stop. Solid body, brand colour, and
 * a halo in the page's own surface so it holds its shape over tiles of any
 * brightness.
 *
 * They mark the origin and destination fields in the form and the first and
 * last nodes of the strip map, and it is the same journey in both places: a
 * traveller should not have to learn the notation twice.
 *
 * Sized by the caller rather than fixed, because the form draws them at the
 * scale of an input's leading icon and the diagram at the scale of its own
 * nodes.
 */

const markerBase = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

interface MarkerProps {
  size?: number;
  /**
   * Which surface the marker is sitting on, as a Tailwind `fill-*` or
   * `stroke-*` class.
   *
   * The pin's centre is a hole punched through the fill rather than a lighter
   * shade of it, and the origin's halo is the same idea turned outward, so both
   * have to be painted in the background they sit on. A card is
   * `surface-raised` and a field is `surface`, and in dark mode those are
   * genuinely different colours.
   */
  hole?: string;
}

export function OriginMarker({ size = 20, hole = 'stroke-surface' }: MarkerProps) {
  return (
    <svg {...markerBase} width={size} height={size} aria-hidden="true" className="text-brand-500">
      {/*
        The halo is the page's own surface: invisible against a form field,
        and what separates the disc from the map underneath it.
      */}
      <circle cx="12" cy="12" r="7" fill="currentColor" strokeWidth="3" className={hole} />
    </svg>
  );
}

/**
 * The pin's outline, exported because the map needs the same shape as a string.
 *
 * Leaflet draws a custom marker from raw markup rather than from a React tree,
 * so the two renderings would otherwise be two hand-copied paths free to drift.
 * The geometry lives here once; the map builds its own `<svg>` around it.
 */
export const DESTINATION_PIN_PATH =
  'M12 21.5s6.5-6 6.5-10.5a6.5 6.5 0 10-13 0c0 4.5 6.5 10.5 6.5 10.5z';

export function DestinationMarker({ size = 20, hole = 'fill-surface' }: MarkerProps) {
  return (
    <svg {...markerBase} width={size} height={size} aria-hidden="true" className="text-brand-500">
      <path d={DESTINATION_PIN_PATH} fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.7" r="2.3" className={hole} stroke="none" />
    </svg>
  );
}
