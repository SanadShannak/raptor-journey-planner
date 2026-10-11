import type { Dictionary, Message } from '../../i18n';

/** One tour per page that has one. */
export type TourId = 'plan' | 'routes' | 'stops' | 'card' | 'favourites';

export interface TourStep {
  /**
   * The `data-tour` value of the element this step points at, or null for a
   * step about the page as a whole, which is shown in the middle of the
   * screen with nothing lit up.
   *
   * An attribute rather than a ref, because the things pointed at belong to
   * a dozen components that have no reason to know a tour exists — one
   * string on the element is the whole of their part in it.
   */
  target: string | null;
  title: (strings: Dictionary) => Message;
  body: (strings: Dictionary) => Message;
}

/**
 * The steps, in order.
 *
 * **A step whose target is not on screen is skipped, not shown pointing at
 * nothing.** Several are conditional by nature: the add-card form exists only
 * for somebody signed in, the travel card page shows a prompt to log in
 * instead, and the navigation links live in a closed menu on a phone. A tour
 * that stopped at a missing element would be broken for exactly the newcomer
 * it is for.
 */
export const TOURS: Record<TourId, readonly TourStep[]> = {
  plan: [
    { target: null, title: (s) => s.tour.plan.welcomeTitle, body: (s) => s.tour.plan.welcomeBody },
    { target: 'plan-places', title: (s) => s.tour.plan.placesTitle, body: (s) => s.tour.plan.placesBody },
    { target: 'plan-when', title: (s) => s.tour.plan.whenTitle, body: (s) => s.tour.plan.whenBody },
    { target: 'plan-pace', title: (s) => s.tour.plan.paceTitle, body: (s) => s.tour.plan.paceBody },
    { target: 'plan-map', title: (s) => s.tour.plan.mapTitle, body: (s) => s.tour.plan.mapBody },
    { target: 'plan-save', title: (s) => s.tour.plan.saveTitle, body: (s) => s.tour.plan.saveBody },
    { target: 'nav', title: (s) => s.tour.plan.navTitle, body: (s) => s.tour.plan.navBody },
  ],
  routes: [
    { target: 'routes-search', title: (s) => s.tour.routes.searchTitle, body: (s) => s.tour.routes.searchBody },
    { target: 'routes-list', title: (s) => s.tour.routes.listTitle, body: (s) => s.tour.routes.listBody },
    { target: 'routes-map', title: (s) => s.tour.routes.mapTitle, body: (s) => s.tour.routes.mapBody },
  ],
  stops: [
    { target: 'stops-map', title: (s) => s.tour.stops.mapTitle, body: (s) => s.tour.stops.mapBody },
    { target: 'stops-nearby', title: (s) => s.tour.stops.nearbyTitle, body: (s) => s.tour.stops.nearbyBody },
    { target: 'stops-modes', title: (s) => s.tour.stops.modesTitle, body: (s) => s.tour.stops.modesBody },
  ],
  card: [
    { target: 'card-intro', title: (s) => s.tour.card.introTitle, body: (s) => s.tour.card.introBody },
    { target: 'card-add', title: (s) => s.tour.card.addTitle, body: (s) => s.tour.card.addBody },
  ],
  favourites: [
    { target: 'favourites-intro', title: (s) => s.tour.favourites.introTitle, body: (s) => s.tour.favourites.introBody },
    { target: 'favourites-rows', title: (s) => s.tour.favourites.rowsTitle, body: (s) => s.tour.favourites.rowsBody },
  ],
};

/**
 * The element a step points at, if it is there and can be seen.
 *
 * "Seen" by size: an element inside a closed menu or a `hidden` block is in
 * the document with no box, and lighting up a zero-sized rectangle in the
 * corner of the screen would be worse than skipping the step.
 */
export function findTarget(target: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(
    `[data-tour="${CSS.escape(target)}"]`,
  );
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

/** Whether a step can be shown right now. */
export function isAvailable(step: TourStep): boolean {
  return step.target === null || findTarget(step.target) !== null;
}
