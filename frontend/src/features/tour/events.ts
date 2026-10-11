/**
 * Events the tour sends to parts of the page it demonstrates.
 *
 * Kept in a file of their own, with nothing else in it, so a component that
 * listens — the journey map — does not import the tour itself.
 */

/** Opens the map's "start here / end here" card in the middle of the map. */
export const TOUR_PICK_OPEN = 'tour:pick-open';
/** Closes it again. */
export const TOUR_PICK_CLOSE = 'tour:pick-close';
