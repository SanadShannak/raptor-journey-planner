import type { GtfsRouteType } from '../../types/journey';
import type { NetworkStop } from '../../types/stop';

/**
 * Whether a stop is served by one of the chosen modes.
 *
 * A **selection**, with an empty one meaning all — the same bargain the line
 * filter on a stop's own page makes, and now the same behaviour: from the
 * resting state a press narrows to the mode pressed rather than switching it
 * off. Two filters side by side that answered a press differently were a
 * puzzle with no reward for solving it.
 *
 * A stop nothing serves cannot match a chosen mode, but the bounding-box
 * endpoint no longer returns any — nothing calls there, so there is nothing to
 * travel from.
 */
export function passesModeFilter(
  stop: NetworkStop,
  chosen: ReadonlySet<GtfsRouteType>,
): boolean {
  if (chosen.size === 0) return true;
  return stop.modes.some((mode) => chosen.has(mode));
}
