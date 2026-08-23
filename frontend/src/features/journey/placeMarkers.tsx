import {
  destinationMarkerMarkup,
  originMarkerMarkup,
} from './placeMarkerMarkup';

/**
 * The two ends of a journey, drawn the same way wherever they appear.
 *
 * A target where you start, a pin where you finish. They mark the origin and
 * destination fields in the form and the first and last nodes of the strip map,
 * and it is the same journey in both places: a traveller should not have to
 * learn the notation twice.
 *
 * The origin was a single open ring, which is exactly what every stop on the
 * map is drawn as — and in the same green as the tram line, so on the map it
 * read as a tram stop. Three rings instead: body, gap, core. No stop is ever
 * drawn with a centre, so nothing else can be mistaken for it, and the green
 * stays, because that is the colour this app has always started in.
 *
 * Sized by the caller rather than fixed, because the form draws them at the
 * scale of an input's leading icon, the diagram at the scale of its own nodes,
 * and the map larger still.
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
   * Both shapes are cut out rather than shaded, so the gap has to be painted in
   * the background it sits on. A card is `surface-raised` and a field is
   * `surface`, and in dark mode those are genuinely different colours.
   */
  hole?: string;
}

export function OriginMarker({ size = 20, hole = 'fill-surface' }: MarkerProps) {
  return (
    <svg
      {...markerBase}
      width={size}
      height={size}
      aria-hidden="true"
      className="text-mode-tram"
      dangerouslySetInnerHTML={{ __html: originMarkerMarkup(hole) }}
    />
  );
}

export function DestinationMarker({ size = 20, hole = 'fill-surface' }: MarkerProps) {
  return (
    <svg
      {...markerBase}
      width={size}
      height={size}
      aria-hidden="true"
      className="text-brand-500"
      dangerouslySetInnerHTML={{ __html: destinationMarkerMarkup(hole) }}
    />
  );
}
