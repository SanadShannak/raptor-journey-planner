/**
 * How to navigate from one of a kind of thing to another of the same kind.
 *
 * Opening a stop from the index is a step *into* something, and belongs in
 * history: back should return to the list. Pressing the next stop along on the
 * map is not — it is the same question asked about a different stop, at the
 * same depth. Treated as a step in, each one stacked, and getting back out
 * took as many presses as stops looked at, in reverse, through every one of
 * them. The same is true of lines.
 *
 * So a move between siblings **replaces**, and carries forward the address the
 * first of them came from. However many are visited, back still means the
 * place the reader actually came from — the index, or a journey in the
 * planner they opened a stop out of.
 *
 * Shared because the reasoning is identical for stops and for lines, and
 * because the failure is silent: nothing breaks, the back button simply grows
 * a queue nobody asked for.
 */
export interface SameKindStep {
  /** History state for the destination: where its back control should lead. */
  state: { back: string };
  /** True to stay at this depth rather than adding an entry. */
  replace: boolean;
}

export function sameKindStep(options: {
  /** Whether the page is already showing one of these. */
  inside: boolean;
  /** The address this entry recorded coming from, if it recorded one. */
  cameFrom: string | null;
  /** The current address, which is the way back for a first step in. */
  here: string;
  /** The section's own index, for a sibling reached without a sender. */
  index: string;
}): SameKindStep {
  const { inside, cameFrom, here, index } = options;

  if (!inside) return { state: { back: here }, replace: false };

  /*
   * A hop with no recorded sender is a deep link somebody has since moved
   * around inside. The section's index is the honest answer: it is where back
   * would fall through to anyway, and it is somewhere rather than the stop
   * just left, which is behind nothing.
   */
  return { state: { back: cameFrom ?? index }, replace: true };
}
