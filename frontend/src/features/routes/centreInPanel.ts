/**
 * Bringing something to the middle of the panel it is in — and of nothing else.
 *
 * `Element.scrollIntoView` cannot be used here, and the reason is worth
 * recording because it looked like exactly the right tool. It scrolls *every*
 * scrollable ancestor, the document included. These pages make their shell
 * `fixed inset-0 overflow-hidden`, so scrolling the window slid the whole fixed
 * layout down by a hundred-odd pixels and left no scrollbar to put it back:
 * the page was stuck, slightly askew, until it was reloaded.
 *
 * So the container is found deliberately and only that one element is moved.
 */

/**
 * The nearest ancestor that actually scrolls, or null when nothing does.
 *
 * Null is a real answer and the right one. Below the breakpoint where the
 * sidebar becomes its own scrolling column, the page itself is what scrolls —
 * and hauling a phone's viewport around under somebody's thumb every ten
 * seconds is not a courtesy. Nothing moves there.
 *
 * The document is never returned, for the same reason: on the wide layout it is
 * the thing that must not move, and on the narrow one moving it is unwelcome.
 */
export function scrollingAncestor(node: Element): Element | null {
  let candidate = node.parentElement;

  while (candidate !== null && candidate !== document.body) {
    const overflow = getComputedStyle(candidate).overflowY;
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      candidate.scrollHeight > candidate.clientHeight
    ) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }

  return null;
}

/** A box, as much of one as this needs. */
export interface Span {
  top: number;
  height: number;
}

/**
 * Where the container should be scrolled to put `node` in its middle.
 *
 * Both spans are viewport-relative, which is what `getBoundingClientRect`
 * gives and what makes this independent of where either element sits in the
 * document. The difference between the two centres is how far the container has
 * to move, and it is added to where it already is.
 */
export function centringScrollTop(node: Span, box: Span, scrollTop: number): number {
  const nodeCentre = node.top + node.height / 2;
  const boxCentre = box.top + box.height / 2;
  // Never past the top; the container clamps the other end itself.
  return Math.max(0, scrollTop + (nodeCentre - boxCentre));
}
