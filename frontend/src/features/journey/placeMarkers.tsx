/**
 * The two ends of a journey, drawn the same way wherever they appear.
 *
 * An open ring where you start, a filled marker where you finish — borrowed
 * from transit maps, where the same pair distinguishes a terminus from a
 * through station. They mark the origin and destination fields in the form and
 * the first and last nodes of the strip map, and it is the same journey in
 * both places: a traveller should not have to learn the notation twice.
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
   * Which surface the marker is sitting on, as a Tailwind `fill-*` class.
   *
   * The pin's centre is a hole punched through the fill rather than a lighter
   * shade of it, so it has to be painted in the background it sits on. A card
   * is `surface-raised` and a field is `surface`, and in dark mode those are
   * genuinely different colours.
   */
  hole?: string;
}

export function OriginMarker({ size = 20 }: MarkerProps) {
  return (
    <svg {...markerBase} width={size} height={size} aria-hidden="true" className="text-mode-tram">
      <circle cx="12" cy="12" r="6.5" strokeWidth="3" />
    </svg>
  );
}

export function DestinationMarker({ size = 20, hole = 'fill-surface' }: MarkerProps) {
  return (
    <svg {...markerBase} width={size} height={size} aria-hidden="true" className="text-brand-500">
      <path
        d="M12 21.5s6.5-6 6.5-10.5a6.5 6.5 0 10-13 0c0 4.5 6.5 10.5 6.5 10.5z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="12" cy="10.7" r="2.3" className={hole} stroke="none" />
    </svg>
  );
}
