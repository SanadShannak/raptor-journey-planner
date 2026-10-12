import type { Dictionary, Message } from '../../i18n';
import type { SceneId } from './scenes';

/** One tour per page that has one. */
export type TourId = 'plan' | 'itinerary' | 'routes' | 'stops' | 'card' | 'favourites';

/**
 * Tours of pages that are a prompt to log in until somebody does.
 *
 * Two rules follow from it, kept together here so they cannot drift apart:
 * the first-visit start waits until somebody is signed in (`useTour`), and a
 * replay watched while signed out does not count as having seen the tour
 * (`endTour`) — otherwise looking at the one-step signed-out version would
 * use up the real one for good.
 */
export const NEEDS_ACCOUNT: ReadonlySet<TourId> = new Set<TourId>(['card', 'favourites']);

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
  /**
   * Light the element up to its exact edges, square-cornered, with no room
   * around it. For the map, which fills its pane edge to edge — padding there
   * spilled onto the header and the content beside it.
   */
  flush?: boolean | undefined;
  /**
   * Something to do to the page while this step is showing — press the map,
   * open a route — so the step can point at what a press does. Kept across
   * consecutive steps naming the same scene, and undone when the tour moves
   * off it or ends; see `scenes.ts`.
   */
  scene?: SceneId | undefined;
  /**
   * `content` lights the element inside its own padding rather than to its
   * border — for a list whose padding is the gap between it and its card.
   */
  fit?: 'content' | undefined;
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
    { target: 'plan-map', flush: true, scene: 'map-pick', title: (s) => s.tour.plan.mapTitle, body: (s) => s.tour.plan.mapBody },
    { target: 'plan-results', title: (s) => s.tour.plan.resultsTitle, body: (s) => s.tour.plan.resultsBody },
    { target: 'plan-save', title: (s) => s.tour.plan.saveTitle, body: (s) => s.tour.plan.saveBody },
    { target: 'nav', title: (s) => s.tour.plan.navTitle, body: (s) => s.tour.plan.navBody },
  ],
  /*
   * Its own tour rather than more steps on the planner's: it explains a view
   * that exists only once a journey has been opened, so it runs the first time
   * one is.
   */
  itinerary: [
    { target: 'itinerary-steps', fit: 'content', title: (s) => s.tour.itinerary.stepsTitle, body: (s) => s.tour.itinerary.stepsBody },
    { target: 'itinerary-stop', title: (s) => s.tour.itinerary.stopTitle, body: (s) => s.tour.itinerary.stopBody },
    { target: 'itinerary-ride', title: (s) => s.tour.itinerary.rideTitle, body: (s) => s.tour.itinerary.rideBody },
    { target: 'plan-map', flush: true, title: (s) => s.tour.itinerary.mapTitle, body: (s) => s.tour.itinerary.mapBody },
    { target: 'itinerary-back', title: (s) => s.tour.itinerary.backTitle, body: (s) => s.tour.itinerary.backBody },
  ],
  routes: [
    { target: 'routes-search', title: (s) => s.tour.routes.searchTitle, body: (s) => s.tour.routes.searchBody },
    { target: 'routes-list', title: (s) => s.tour.routes.listTitle, body: (s) => s.tour.routes.listBody },
    { target: 'route-detail', scene: 'open-first-route', title: (s) => s.tour.routes.detailTitle, body: (s) => s.tour.routes.detailBody },
    { target: 'routes-map', flush: true, scene: 'open-first-route', title: (s) => s.tour.routes.mapTitle, body: (s) => s.tour.routes.mapBody },
  ],
  stops: [
    { target: 'stops-map', flush: true, title: (s) => s.tour.stops.mapTitle, body: (s) => s.tour.stops.mapBody },
    { target: 'stops-nearby', title: (s) => s.tour.stops.nearbyTitle, body: (s) => s.tour.stops.nearbyBody },
    { target: 'stops-modes', title: (s) => s.tour.stops.modesTitle, body: (s) => s.tour.stops.modesBody },
    { target: 'stop-detail', scene: 'open-first-stop', title: (s) => s.tour.stops.detailTitle, body: (s) => s.tour.stops.detailBody },
  ],
  card: [
    { target: 'card-intro', title: (s) => s.tour.card.introTitle, body: (s) => s.tour.card.introBody },
    { target: 'card-add', scene: 'open-add-card', title: (s) => s.tour.card.addTitle, body: (s) => s.tour.card.addBody },
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
