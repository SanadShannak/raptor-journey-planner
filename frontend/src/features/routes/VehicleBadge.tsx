import { vehicleMarkup } from './vehicleMarkup';

interface Props {
  /** The visual family — `bus`, `tram`, … — not a raw route type. */
  family: string;
  /** Compass degrees, 0 north and 90 east. */
  bearing: number;
}

/**
 * A vehicle, drawn wherever the interface rather than the map needs one.
 *
 * The markup comes from {@link vehicleMarkup} so this and the map's own marker
 * cannot drift — they are the same picture in two renderers, which is the same
 * arrangement the mode silhouettes already have.
 *
 * `aria-hidden`, and deliberately. What it says is already in the row beside
 * it — the next departure and the countdown — and a picture that moves every
 * few seconds is the last thing that should be announcing itself. The stop rows
 * carry a quiet, unannounced note instead.
 */
export function VehicleBadge({ family, bearing }: Props) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none block"
      dangerouslySetInnerHTML={{ __html: vehicleMarkup(family, bearing) }}
    />
  );
}
