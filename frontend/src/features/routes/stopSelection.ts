import type { PatternStop } from '../../types/route';

/**
 * Choosing two stops of a line, in the order you would travel them.
 *
 * A timetable from A to B is only a question if B is after A. Offering every
 * stop in both fields lets somebody ask for a journey the vehicle does not
 * make, and answering that with an empty table teaches them nothing — so the
 * destination field is narrowed instead, which makes the impossible choice
 * unavailable rather than merely wrong.
 *
 * Keyed on {@link PatternStop.sequence} rather than array position throughout.
 * A stop whose record is missing is dropped from the list, so positions and
 * sequences are not the same numbers, and the sequence is what a trip's `calls`
 * is indexed by.
 */

/** The stops a vehicle reaches after the given one. */
export function stopsAfter(stops: PatternStop[], origin: number | null): PatternStop[] {
  if (origin === null) return stops;
  return stops.filter((stop) => stop.sequence > origin);
}

/**
 * A pair of choices made valid, given whatever was chosen before.
 *
 * Called on every change rather than only on a reset, so there is one rule
 * instead of one per field. Three things it settles:
 *
 * - **Nothing chosen yet** opens on the two ends of the line, which is the
 *   question most people came to ask.
 * - **The origin moved past the destination**, which is the ordinary way to
 *   break the pair: the destination becomes the next stop along, not the
 *   terminus — the reader was looking at this part of the route.
 * - **The origin is the last stop**, where there is no destination to have.
 *   Null rather than a fallback — the honest answer is that this asks nothing.
 *
 * A stop that is not on the line at all — a variant was switched underneath the
 * selection — counts as no choice rather than as a broken one, and reaches for
 * that end of the new line. Which is the difference between "you picked
 * something impossible" and "you have not picked anything here yet".
 */
export function reconcileSelection(
  stops: PatternStop[],
  origin: number | null,
  destination: number | null,
): { origin: number | null; destination: number | null } {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) return { origin: null, destination: null };

  const has = (sequence: number | null): boolean =>
    sequence !== null && stops.some((stop) => stop.sequence === sequence);

  const resolvedOrigin = has(origin) ? (origin as number) : first.sequence;

  const forward = stopsAfter(stops, resolvedOrigin);
  const firstForward = forward[0];

  if (firstForward === undefined) return { origin: resolvedOrigin, destination: null };

  if (has(destination)) {
    const chosen = destination as number;
    /*
     * A destination the origin has overtaken settles for the next stop along
     * rather than the end of the line: the reader was looking at this part of
     * the route, and throwing them to the terminus loses that.
     */
    return {
      origin: resolvedOrigin,
      destination: chosen > resolvedOrigin ? chosen : firstForward.sequence,
    };
  }

  /*
   * Nothing chosen, or a choice that is not on this line at all — a variant was
   * switched underneath it. Both reach for the end of the line, because both
   * mean the reader has expressed no preference about *this* route.
   */
  return { origin: resolvedOrigin, destination: last.sequence };
}
