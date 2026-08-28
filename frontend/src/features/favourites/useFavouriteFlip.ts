import { useLayoutEffect, useRef } from 'react';

/**
 * How long a card takes to glide into its new spot.
 *
 * Slow enough to read as a movement rather than a jump. It was 160ms, which is
 * about right for a control acknowledging a press and too quick for this: a
 * card crossing most of the row in that time is a thing that has *already
 * arrived*, and the eye reports a flicker where the point was to show which
 * card went where.
 *
 * The ceiling is the drag itself. The glide happens while a finger is still
 * moving, and a row that is still settling when the pointer reaches the next
 * card feels like it is lagging behind the hand — so this stays well under the
 * time it takes to drag from one card to the next.
 */
const DURATION_MS = 280;

/**
 * The curve, and the reason it is not the default.
 *
 * `ease` starts fast and spends its tail decelerating, which at this duration
 * reads as the card being thrown and then hesitating. A gentle ease-in-out
 * starts and ends at rest, so a card that has been nudged one place looks
 * pushed rather than flung — and the row settles together rather than each
 * card arriving on its own schedule.
 */
const EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Animates a row's cards sliding into their new positions after a reorder.
 *
 * A drag already lifts the card being carried — see `FavouriteCard` — but
 * every *other* card in the row used to just snap: `reorderFavourite` changes
 * the stored order, React moves the `<li>`s to match, and the browser lays
 * them out in their new spots with nothing in between. On a row of five that
 * read as a flicker rather than a shuffle.
 *
 * This is FLIP — First, Last, Invert, Play — done by hand rather than with a
 * library, because it is four lines: read where each card ends up, and if
 * that is not where it was a moment ago, paint it at the old spot with a
 * transform and immediately transition that transform to zero. The card
 * never actually moves twice; it only ever *looks* like it does.
 *
 * Keyed by `data-favourite`, the same attribute the drag loop in
 * `FavouritesPage` already reads off each card, so nothing new has to be
 * threaded through the row for this to find them.
 *
 * **The card being dragged glides too**, which is the whole point — it is the
 * one the gesture is about, and watching it teleport between slots while its
 * neighbours slid politely around it was worse than nothing moving at all.
 * That works because the lift it wears while held is Tailwind's `translate`
 * property rather than `transform`: the two are separate CSS properties and
 * compose rather than overwrite, so a card can be lifted and gliding at once.
 *
 * While a card is mid-flight it carries `data-flipping`, and the drag loop
 * refuses to reorder onto one that does. Hit testing reads *painted*
 * positions, so without that a card still travelling under the pointer would
 * be offered as a drop target it has not actually reached yet, and the row
 * would oscillate for as long as the finger stayed still.
 *
 * Reduced motion is not handled here: the global stylesheet already collapses
 * every transition to near-zero for anyone who has asked for less movement,
 * and an inline `transition` written from JavaScript is still a CSS
 * transition that rule can see.
 */
export function useFavouriteFlip(
  containerRef: React.RefObject<HTMLElement | null>,
  order: readonly string[],
): void {
  const rectsRef = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const cards = container.querySelectorAll<HTMLElement>('[data-favourite]');

    cards.forEach((el) => {
      const key = el.dataset['favourite'];
      if (key === undefined) return;

      /*
       * Measured with any in-flight transform undone, so `prev` is always a
       * *settled* position. Reading it mid-glide would record where the card
       * happened to be painted at that instant, and the next reorder would
       * invert from there — each animation starting a little further from the
       * truth than the last.
       */
      const inFlight = el.style.transform !== '';
      if (inFlight) el.style.transform = '';
      const next = el.getBoundingClientRect();

      const prev = rectsRef.current.get(key);
      rectsRef.current.set(key, next);

      if (prev === undefined) return;

      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) return;

      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.dataset['flipping'] = '';
      // Forces the browser to paint the inverted position before the next
      // line asks it to transition away from it, or the two would collapse
      // into one frame and nothing would appear to move at all.
      el.getBoundingClientRect();

      requestAnimationFrame(() => {
        el.style.transition = `transform ${DURATION_MS}ms ${EASING}`;
        el.style.transform = '';
      });

      /*
       * Cleared on a timer rather than on `transitionend`, which never fires
       * when a reorder interrupts this glide with the next one — the element
       * would keep `data-flipping` for the rest of the drag and stop being a
       * drop target at all. A later flip simply re-stamps the attribute, so
       * an early clear costs nothing.
       */
      window.setTimeout(() => {
        delete el.dataset['flipping'];
      }, DURATION_MS);
    });
    // `order` is the reorder signal — the list of keys in this row's own
    // sequence — so the effect re-runs exactly when a drag or a keyboard move
    // has actually changed it.
  }, [containerRef, order]);
}
