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
export function scrollingAncestor(node: Element): HTMLElement | null {
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

/**
 * How far `node` sits below the top of `container`'s scrollable content.
 *
 * Measured as the gap between the two boxes plus however far the container has
 * already scrolled — which sounds like it should drift as the container moves,
 * and is the one form that does not. The gap shrinks by exactly what `scrollTop`
 * grows by, so the sum is the node's fixed place in the content and is the same
 * answer whether it is taken at rest or halfway through a smooth scroll.
 *
 * The obvious alternative, walking `offsetParent`, does not work here: that
 * chain skips every statically-positioned ancestor, and the panel is one — so
 * it leaps straight over the container to the body and the walk has nothing to
 * stop at.
 */
export function offsetWithin(node: HTMLElement, container: HTMLElement): number {
  return (
    node.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  );
}

/**
 * Where the container should be scrolled to put a node in its middle.
 *
 * Everything here is in the container's own content coordinates, so it is a
 * fixed target: issuing it twice in a row is idempotent, and issuing it while
 * an earlier smooth scroll is still running simply retargets that scroll rather
 * than compounding with it.
 */
export function centringScrollTop(
  offsetTop: number,
  nodeHeight: number,
  containerHeight: number,
): number {
  // Never past the top; the container clamps the other end itself.
  return Math.max(0, offsetTop - (containerHeight - nodeHeight) / 2);
}
