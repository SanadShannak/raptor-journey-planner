import { matchPath } from 'react-router';
import type { Dictionary, Message } from '../i18n/dictionary';
import { paths } from './routes';

/**
 * What a back control should call the place it is about to return to.
 *
 * Derived from the address itself, and that is the fix rather than the design:
 * it used to be chosen from whether a return address *existed*, so a run opened
 * from a stop's departure board offered "Back to the journey" — there was a
 * sender, and the sender was assumed to be the planner because the planner was
 * the first thing that ever set one. Three levels in that is wrong more often
 * than it is right.
 *
 * Each history entry carries its own return address, so reading the path is
 * reading the truth about *this* step rather than about the first one.
 *
 * Falls back to the plain word. A place that has no name worth saying is better
 * described as "back" than as somewhere it is not.
 */
export function backLabel(to: string | null, strings: Dictionary): Message {
  if (to === null) return strings.nav.back;

  // Only the path is matched: a search string can name a variant or a trip, and
  // none of that changes what *kind* of place is behind you.
  const path = to.split('?')[0] ?? to;

  if (matchPath(paths.stopDetail, path) !== null) return strings.stops.backToStop;
  if (matchPath(paths.routeDetail, path) !== null) return strings.routes.backToLine;
  if (path === paths.home || path === paths.plan) return strings.stops.backToJourney;
  // The two indexes name themselves, and they are the same words the fallback
  // uses — so a control reads the same whether it is stepping back to the list
  // or giving up and going there.
  if (path === paths.routes) return strings.routes.backToLines;
  if (path === paths.stops) return strings.stops.backToStops;

  return strings.nav.back;
}
