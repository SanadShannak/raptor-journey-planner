import { useLocale } from '../../i18n';

/**
 * The two things printed on a stop that are codes rather than sentences.
 *
 * Both used to be written out — "Stop H0329", "Zone A" — and in a list where
 * every row is a stop, the word "Stop" is true of all of them and tells you
 * about none. It also spent half the width of a column whose whole job is a
 * short code beside a long name. A badge says the same thing by being one.
 *
 * The word survives for a screen reader, which has no column to read it off
 * and would otherwise be handed a bare "H0329".
 */

/** The code printed on the pole, which tells six stops called "Pasila" apart. */
export function StopCode({ code }: { code: string }) {
  const { strings, t } = useLocale();

  return (
    <span className="rounded-control border-border-strong text-content-muted inline-flex items-center border px-1.5 py-0.5 text-xs font-medium tabular-nums">
      <span aria-hidden="true">{code}</span>
      <span className="sr-only">{t(strings.stops.stopCode, { code })}</span>
    </span>
  );
}

/**
 * The fare zone, as the disc a fare map draws it as.
 *
 * A single letter, so a circle fits it and reads as a zone marker rather than
 * as another code — which is the distinction the words used to carry. Brand
 * fill rather than a mode colour: a zone belongs to the network's fares, not to
 * whatever happens to call here.
 */
export function FareZone({ zone }: { zone: string }) {
  const { strings, t } = useLocale();

  return (
    <span className="bg-brand-fill text-on-brand inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold">
      <span aria-hidden="true">{zone}</span>
      <span className="sr-only">{t(strings.stops.fareZone, { zone })}</span>
    </span>
  );
}
