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
  const rectsRef = useRef(new Map<string, { left: number; top: number }>());

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
       * The card's slot, from layout offsets rather than from its box on
       * screen. Offsets ignore transforms — a glide in progress, the lift and
       * carry of a held card — so measuring one never has to touch them.
       *
       * The first version did touch them: it cleared each card's transform to
       * see where its slot was, on every reorder, for every card. A card still
       * sliding from the last swap was stopped and restarted from scratch even
       * when this swap had not moved it at all — a hitch in its slide each
       * time anything else in the row changed places.
       */
      const next = slotOf(el);
      const before = rectsRef.current.get(key);
      rectsRef.current.set(key, next);

      if (!reordered) return;

      // Not moved by this reorder: whatever it is doing, it carries on.
      if (before !== undefined && Math.abs(before.left - next.left) < 0.5 && Math.abs(before.top - next.top) < 0.5) {
        return;
      }

      /*
       * Moved. The glide starts from where the card was **painted** an
       * instant before the reorder — recorded by the drag, see
       * `notePaintedPositions` — so a card turned round mid-slide sets off
       * from where it actually is. Without that record, as for a keyboard
       * move, it starts from its old slot.
       */
      const start = paintedBefore?.get(key) ?? before;
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

/**
 * Where an element's layout box is on screen, ignoring any transform or
 * `translate` it wears: its offset within its offset parent, placed by that
 * parent's own box. The parent is never transformed, so its box is exact.
 */
function slotOf(el: HTMLElement): { left: number; top: number } {
  const parent = el.offsetParent;
  const base = parent instanceof HTMLElement ? parent.getBoundingClientRect() : { left: 0, top: 0 };
  const edgeLeft = parent instanceof HTMLElement ? parent.clientLeft : 0;
  const edgeTop = parent instanceof HTMLElement ? parent.clientTop : 0;
  return { left: base.left + edgeLeft + el.offsetLeft, top: base.top + edgeTop + el.offsetTop };
}
