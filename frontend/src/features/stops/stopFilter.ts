import type { GtfsRouteType } from '../../types/journey';
import type { NetworkStop } from '../../types/stop';

/**
 * Whether a stop survives the modes that have been switched off.
 *
 * The filter is a set of **exclusions**, not selections. Every mode the network
 * runs starts switched on, and pressing one turns it off — so the resting state
 * shows everything and each press takes something away. The alternative, where
 * an empty selection secretly means "all", asks a reader to hold two meanings
 * for the same empty set.
 *
 * Two cases the obvious one-liner gets wrong:
 *
 * - **An interchange keeps its other modes.** Switching off buses must not
 *   remove a stop where buses and trams both call — it is still a tram stop,
 *   and it is still the one somebody is looking for.
 * - **A stop nothing serves is not a stop of the kind being hidden.** Those are
 *   real in a feed, where a stop outlives its routes. Switching off buses says
 *   nothing about it, so it stays.
 */
export function passesModeFilter(
  stop: NetworkStop,
  modesOff: ReadonlySet<GtfsRouteType>,
): boolean {
  if (modesOff.size === 0) return true;
  if (stop.modes.length === 0) return true;
  return stop.modes.some((mode) => !modesOff.has(mode));
}
