import { useLayoutEffect, useRef } from 'react';

/**
 * How long a card takes to glide into its new spot.
 *
 * Slow enough to read as a movement rather than a jump. It was 160ms, which is
 * about right for a control acknowledging a press and far too quick for this:
 * a card crossing most of the row in that time has *already arrived*, and the
 * eye reports a flicker where the point was to show which card went where.
 *
 * The ceiling is the drag itself. The glide happens while a finger is still
 * moving, and a row still settling when the pointer reaches the next card
 * feels like it is lagging behind the hand. These cards are wide — a row holds
 * two or three — so crossing one takes a deliberate movement rather than a
 * flick, and there is more room here than the number suggests.
 */
const DURATION_MS = 400;

/**
 * Each card's pending "glide finished" timer. Only the latest glide's timer
 * may clear the flag: an earlier one firing mid-way through a later glide
 * marked a still-moving card as settled, and hit testing then offered it as a
 * drop target before it had arrived.
 */
const flipTimers = new WeakMap<HTMLElement, number>();

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
 * **The card being dragged does not glide.** It is carried under the finger
 * instead — see `startDrag` in `FavouritesPage` — so it is always already
 * where it is being put, and only its neighbours have anywhere to go. It
 * carries `data-dragging` so this can tell it apart.
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

  /**
   * The sequence itself, not the array holding it.
   *
   * This is the difference between animating a *reorder* and animating any
   * layout change at all, and getting it wrong was visible on every visit: the
   * page rebuilds each row's list while rendering, so the array arrived new
   * on every render, and the effect ran on every render with it. Most of those
   * are not reorders — a clock tick, a network answer — but they are often
   * renders where something *moved*, because a card grows when its departures
   * arrive and every row below it shifts down.
   *
   * The result was the whole page gliding into place a few hundred
   * milliseconds after it appeared, and again whenever a timetable refreshed,
   * as though it had been reloaded. Nothing had been reordered either time.
   */
  const signature = order.join('\u0000');
  const lastSignature = useRef(signature);

  /*
   * Deliberately every render, with no dependency array.
   *
   * Measuring is cheap and the measurements have to stay current: a row that
   * moved because a card grew has to be *recorded*, or the next real reorder
   * would invert from a position the card left long ago and glide in from
   * somewhere it had never been. What the signature gates is the animation,
   * not the reading.
   */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const reordered = lastSignature.current !== signature;
    lastSignature.current = signature;

    const cards = container.querySelectorAll<HTMLElement>('[data-favourite]');

    const paintedBefore = reordered ? takePaintedPositions() : null;

    cards.forEach((el) => {
      const key = el.dataset['favourite'];
      if (key === undefined) return;

      /*
       * The lift and carry a held card wears is the separate `translate`
       * property; taken off, what is left is the card's slot.
       */
      const lift = el.style.translate
        .split(' ')
        .map((part) => parseFloat(part) || 0);
      const liftX = lift[0] ?? 0;
      const liftY = lift[1] ?? 0;

      if (!reordered) {
        /*
         * Kept current between reorders — a card that grew moves the cards
         * after it — but only while nothing is gliding, whose painted box is
         * not its slot.
         */
        if (el.dataset['flipping'] === undefined) {
          const box = el.getBoundingClientRect();
          rectsRef.current.set(key, new DOMRect(box.left - liftX, box.top - liftY, box.width, box.height));
        }
        return;
      }

      /*
       * A reorder. The glide starts from where the card was **painted** an
       * instant before it — recorded by the drag itself, see
       * `notePaintedPositions` — and only falls back to the last known slot
       * when nothing was recorded, as for a keyboard move.
       *
       * Reading where a gliding card "is" from its slot and its running
       * transform was the first version, and it was the visible glitch on a
       * fast drag: a glide that had only just been handed to the browser
       * still reported no transform, so a second reorder landing then started
       * the card from the slot it was leaving — a jump of whole slots in a
       * frame. The painted box is the one thing that is never out of date.
       */
      const start = paintedBefore?.get(key) ?? rectsRef.current.get(key);

      // Whatever glide is running stops here, so the slot can be measured.
      el.style.transition = 'none';
      el.style.transform = 'none';
      const box = el.getBoundingClientRect();
      const next = new DOMRect(box.left - liftX, box.top - liftY, box.width, box.height);
      rectsRef.current.set(key, next);
      el.style.transform = '';

      if (start === undefined) return;
      /*
       * The held card is carried by the finger — see `startDrag` in
       * `FavouritesPage` — so it has nowhere to glide to: it is already
       * where the reader is putting it.
       */
      if (el.dataset['dragging'] !== undefined) return;

      const dx = start.left - next.left;
      const dy = start.top - next.top;
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
      window.clearTimeout(flipTimers.get(el));
      flipTimers.set(
        el,
        window.setTimeout(() => {
          delete el.dataset['flipping'];
        }, DURATION_MS),
      );
    });
  });
}

/**
 * Where every card was painted just before a reorder, noted by whoever is
 * about to ask for one, and used once by the glide that follows.
 */
let painted: Map<string, DOMRect> | null = null;

/**
 * Notes where each favourite card is painted on screen, right now.
 *
 * Called immediately before a reorder is requested, so the glide that follows
 * starts every card from exactly where it was seen — wherever an earlier glide
 * had got it to — rather than from a slot it may already have been leaving.
 */
export function notePaintedPositions(): void {
  painted = new Map();
  for (const el of document.querySelectorAll<HTMLElement>('[data-favourite]')) {
    const key = el.dataset['favourite'];
    if (key !== undefined) painted.set(key, el.getBoundingClientRect());
  }
}

function takePaintedPositions(): Map<string, DOMRect> | null {
  const taken = painted;
  painted = null;
  return taken;
}
